import { callCrmRpc } from "@/lib/crm-supabase"

export type MarketingConsentRecordType = "lead" | "contact" | "customer"

export type MarketingConsentResult = {
  recordType: MarketingConsentRecordType
  recordId: string
  marketingOptIn: boolean
  marketingConsentSource: string | null
  marketingConsentUpdatedAt: string
}

export async function setMarketingOptIn(
  recordType: MarketingConsentRecordType,
  recordId: string,
  optedIn: boolean,
  reason?: string,
) {
  return callCrmRpc<MarketingConsentResult>(
    "multideck_crm_set_marketing_opt_in",
    {
      p_record_type: recordType,
      p_record_id: recordId,
      p_opted_in: optedIn,
      p_reason: reason?.trim() || null,
    },
    "Marketing consent could not be updated.",
    "Sign in again to update marketing consent.",
  )
}
