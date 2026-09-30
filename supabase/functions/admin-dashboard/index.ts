import { authenticate, authenticatedClient, body, corsHeaders, currentInternalUser, HttpError, json, routeParts } from "../_shared/backend.ts"
import { reportingDates, validateTelemetry } from "./core.ts"

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user, token } = await authenticate(request)
    await currentInternalUser(admin, user)
    const client = authenticatedClient(token)
    const parts = routeParts(request, "admin-dashboard")
    let result
    if (request.method === "POST" && parts.join("/") === "telemetry") {
      let event
      try { event = validateTelemetry(await body(request)) } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid usage event.") }
      result = await client.rpc("multideck_admin_record_usage", { p_event: event })
    } else if (request.method === "GET" && parts.length === 0) {
      const query = new URL(request.url).searchParams
      let period
      try { period = reportingDates(query.get("from"), query.get("to")) } catch { throw new HttpError(400, "Choose a valid reporting period of at most one year.") }
      result = await client.rpc("multideck_admin_dashboard", { p_from: period.from, p_to: period.to })
    } else throw new HttpError(404, "That dashboard operation is unavailable.")
    if (result.error) throw new HttpError(result.error.code === "42501" ? 403 : result.error.code === "22023" ? 400 : 503, result.error.code === "42501" || result.error.code === "22023" ? result.error.message : "Workspace analytics could not be loaded. Try again.")
    return json(request, result.data)
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    return json(request, { detail: error instanceof HttpError ? error.message : "Workspace analytics are temporarily unavailable." }, status)
  }
})
