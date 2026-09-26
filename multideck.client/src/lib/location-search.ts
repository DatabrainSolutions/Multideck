import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type SuggestedAddress = { line1: string; line2: string; townCity: string; countyState: string; postZipCode: string; countryCode: string }
export type LocationSuggestion = { id: string; label: string; detail: string; value: string; address?: SuggestedAddress }

export async function searchLocations(query: string, signal: AbortSignal): Promise<LocationSuggestion[]> {
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to search for a location.")
  const response = await edgeFetch("address-search", "", session.access_token, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.detail || "Suggestions are unavailable. You can still enter your own location.")
  return Array.isArray(payload?.items) ? payload.items : []
}
