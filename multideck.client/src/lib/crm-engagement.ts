import type { StatusTone } from "@/data/operational-data"
import { callCrmRpc } from "@/lib/crm-supabase"

export type CrmEngagementTemperature = "Cold" | "Warm" | "Hot"

export type CrmEngagementSignal = {
  recordId: string
  temperature: CrmEngagementTemperature
  score: number
  lastEngagementAt: string | null
  activityCount30d: number
  emailCount30d: number
  inboundEmailCount30d: number
  emailAvailable: boolean
  calculatedFromSources: boolean
}

type CrmEngagementWireSignal = Omit<CrmEngagementSignal, "emailAvailable" | "calculatedFromSources">

type CrmEngagementResponse = {
  emailAvailable: boolean
  accounts: CrmEngagementWireSignal[]
  leads: CrmEngagementWireSignal[]
}

export function engagementTemperatureTone(temperature: CrmEngagementTemperature): StatusTone {
  if (temperature === "Hot") return "green"
  if (temperature === "Warm") return "amber"
  return "blue"
}

export function fallbackEngagementSignal(recordId: string, lastEngagementAt: string | null): CrmEngagementSignal {
  const elapsed = lastEngagementAt ? Date.now() - new Date(lastEngagementAt).getTime() : Number.POSITIVE_INFINITY
  const temperature: CrmEngagementTemperature = elapsed <= 7 * 86_400_000 ? "Hot" : elapsed <= 30 * 86_400_000 ? "Warm" : "Cold"
  return {
    recordId,
    temperature,
    score: temperature === "Hot" ? 45 : temperature === "Warm" ? 25 : 0,
    lastEngagementAt,
    activityCount30d: 0,
    emailCount30d: 0,
    inboundEmailCount30d: 0,
    emailAvailable: false,
    calculatedFromSources: false,
  }
}

export async function getCrmEngagementSignals(input: { accountIds?: string[]; leadIds?: string[] }) {
  const response = await callCrmRpc<CrmEngagementResponse>(
    "multideck_crm_engagement_signals",
    { p_account_ids: input.accountIds ?? [], p_lead_ids: input.leadIds ?? [] },
    "CRM engagement temperature could not be calculated.",
    "Sign in again to view CRM engagement.",
  )
  const withAvailability = (signal: CrmEngagementWireSignal): CrmEngagementSignal => ({
    ...signal,
    emailAvailable: response.emailAvailable,
    calculatedFromSources: true,
  })
  return {
    accounts: new Map(response.accounts.map((signal) => [signal.recordId, withAvailability(signal)])),
    leads: new Map(response.leads.map((signal) => [signal.recordId, withAvailability(signal)])),
  }
}
