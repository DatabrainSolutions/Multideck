import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type SuggestedAddress = { line1: string; line2: string; townCity: string; countyState: string; postZipCode: string; countryCode: string }
export type LocationSuggestion = { id: string; label: string; detail: string; value: string; address?: SuggestedAddress }

// Public results only, scoped to the signed-in user and kept briefly in memory.
const cache = new Map<string, { expires: number; items: LocationSuggestion[] }>()

export async function searchLocations(query: string, signal: AbortSignal): Promise<LocationSuggestion[]> {
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in again to search for a location.")
  signal.throwIfAborted()
  const key = `${session.user.id}:${query.trim().toLocaleLowerCase()}`
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.items
  const response = await edgeFetch("address-search", "", session.access_token, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.detail || "Suggestions are unavailable. You can still enter your own location.")
  const items: LocationSuggestion[] = Array.isArray(payload?.items) ? payload.items : []
  if (cache.size >= 80) cache.delete(cache.keys().next().value!)
  cache.set(key, { expires: Date.now() + 60_000, items })
  return items
}
