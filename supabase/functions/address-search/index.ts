import { authenticate, corsHeaders, currentInternalUser, failure, HttpError, json } from "../_shared/backend.ts"
import { locationQuery, locationSuggestions, type LocationSuggestion } from "../event-location-search/core.ts"

// Public directory suggestions only; no tenant records are read or written.
// Any active internal colleague can search, independently of Events permission.
// Each form still enforces its own record-write permissions and review/save flow.
// Dexter exception: chat and Watching for you use saved, reviewed addresses;
// transient third-party suggestions are neither evidence nor watchable records.
const cache = new Map<string, { until: number; items: LocationSuggestion[] }>()
const requests = new Map<string, { until: number; count: number }>()

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    if (request.method !== "POST") throw new HttpError(405, "Use POST to search for an address.")
    const { admin, user } = await authenticate(request)
    const actor = await currentInternalUser(admin, user)
    if (!actor.Company_ID) throw new HttpError(403, "Your account is not linked to this workspace.")
    const input = await request.json().catch(() => null)
    let query: string
    try { query = locationQuery(input?.query) } catch { throw new HttpError(400, "Enter between 3 and 240 characters.") }
    const now = Date.now()
    for (const [id, entry] of requests) if (entry.until < now) requests.delete(id)
    const budget = requests.get(user.id) ?? { until: now + 60_000, count: 0 }
    if (++budget.count > 40) throw new HttpError(429, "Pause for a moment, or keep your typed address.")
    requests.set(user.id, budget)
    const key = query.toLocaleLowerCase()
    const cached = cache.get(key)
    if (cached && cached.until > now) return json(request, { items: cached.items })
    const url = new URL(Deno.env.get("ADDRESS_SEARCH_URL")?.trim() || Deno.env.get("EVENT_LOCATION_SEARCH_URL")?.trim() || "https://photon.komoot.io/api/")
    url.searchParams.set("q", query)
    url.searchParams.set("lang", "en")
    url.searchParams.set("limit", "6")
    let items: LocationSuggestion[]
    try {
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Multideck/1.0 (https://multideck.app)" }, signal: AbortSignal.timeout(6000) })
      if (!response.ok) throw new Error("Place provider unavailable")
      items = locationSuggestions(await response.json())
    } catch { throw new HttpError(503, "Suggestions are unavailable. You can still enter your own address.") }
    if (cache.size >= 200) cache.delete(cache.keys().next().value!)
    cache.set(key, { until: now + 5 * 60_000, items })
    return json(request, { items })
  } catch (error) { return failure(request, error) }
})
