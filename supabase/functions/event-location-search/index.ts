import { authenticate, corsHeaders, currentInternalUser, failure, HttpError, json, requirePermission } from "../_shared/backend.ts"
import { locationQuery, locationSuggestions, type LocationSuggestion } from "./core.ts"

// Transient location suggestions are an operator input aid, not saved evidence.
// Dexter chat and Watching for you continue to read the reviewed event location;
// searching this third-party directory and watching suggestions are unsupported.
// No event or user data is sent to the provider beyond the typed search query.
const cache = new Map<string, { until: number; items: LocationSuggestion[] }>()
const requests = new Map<string, { until: number; count: number }>()

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    if (request.method !== "POST") throw new HttpError(405, "Use POST to search for a location.")
    const { admin, user } = await authenticate(request)
    const actor = await currentInternalUser(admin, user)
    await requirePermission(admin, actor.User_ID, "Events.Manage")
    const { data: settings, error } = await admin.from("company_event_settings").select("enabled").eq("company_id", actor.Company_ID).maybeSingle()
    if (error || !settings?.enabled) throw new HttpError(403, "Events are unavailable for this workspace.")
    const input = await request.json().catch(() => null)
    let query: string
    try { query = locationQuery(input?.query) } catch { throw new HttpError(400, "Enter between 3 and 240 characters.") }

    // Bound memory and burst traffic within each worker; debounce and query reuse
    // in the field also keep this optional public service's usage modest.
    const now = Date.now()
    for (const [id, entry] of requests) if (entry.until < now) requests.delete(id)
    const budget = requests.get(user.id) ?? { until: now + 60_000, count: 0 }
    if (++budget.count > 40) throw new HttpError(429, "Pause for a moment, or keep your typed location.")
    requests.set(user.id, budget)
    const key = query.toLocaleLowerCase()
    const cached = cache.get(key)
    if (cached && cached.until > now) return json(request, { items: cached.items })

    const url = new URL(Deno.env.get("EVENT_LOCATION_SEARCH_URL")?.trim() || "https://photon.komoot.io/api/")
    url.searchParams.set("q", query)
    url.searchParams.set("lang", "en")
    url.searchParams.set("limit", "6")
    let items: LocationSuggestion[]
    try {
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Multideck-Events/1.0 (https://multideck.app)" }, signal: AbortSignal.timeout(6000) })
      if (!response.ok) throw new Error("Place provider unavailable")
      items = locationSuggestions(await response.json())
    } catch { throw new HttpError(503, "Suggestions are unavailable. You can still enter your own location.") }
    if (cache.size >= 200) cache.delete(cache.keys().next().value!)
    cache.set(key, { until: now + 5 * 60_000, items })
    return json(request, { items })
  } catch (error) { return failure(request, error) }
})
