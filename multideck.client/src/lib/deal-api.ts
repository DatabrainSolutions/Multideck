import { callCrmRpc, CrmSupabaseError } from "@/lib/crm-supabase"

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
  return callCrmRpc<ApiDeal>(
    "multideck_crm_convert_lead",
    { p_lead_id: leadId, p_input: input },
    "This lead could not be converted.",
    "Sign in again to manage CRM deals.",
  )
}

export async function listDeals() {
  return callCrmRpc<ApiDeal[]>(
    "multideck_crm_list_deals",
    undefined,
    "CRM deals could not be loaded.",
    "Sign in again to manage CRM deals.",
  )
}

export async function moveDealStage(dealId: string, pipelineId: string, pipelineStageId: string) {
  return callCrmRpc<ApiDeal>(
    "multideck_crm_move_deal_stage",
    {
      p_deal_id: dealId,
      p_pipeline_id: pipelineId,
      p_pipeline_stage_id: pipelineStageId,
    },
    "This deal could not be moved.",
    "Sign in again to manage CRM deals.",
  )
}
