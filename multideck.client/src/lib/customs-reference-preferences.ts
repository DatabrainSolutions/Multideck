import { supabase } from "@/lib/supabase"

export type CustomsBadge = { id: string; code: string; provider: string; portCode: string; portName: string; active: boolean }
export type CustomsReferencePreferences = { eori: string; defaultOfficeId: string; officeEoris: Record<string, string>; badges: CustomsBadge[] }
export type CustomsReferencePreferencesState = { settings: CustomsReferencePreferences; version: number; offices: { id: string; name: string }[]; canManage: boolean }

export async function getCustomsReferencePreferences(settings?: CustomsReferencePreferences, version?: number): Promise<CustomsReferencePreferencesState> {
  if (!supabase) throw new Error("The workspace connection is unavailable.")
  const { data, error } = await supabase.rpc("customs_reference_preferences", { payload: settings ?? null, expected_version: version ?? null })
  if (error) throw new Error(settings ? `Customs preferences could not be saved. ${error.message}` : "Customs preferences could not be loaded. Ask an administrator to check the configuration.")
  return data as CustomsReferencePreferencesState
}
