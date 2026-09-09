import {
  authenticate,
  corsHeaders,
  currentInternalUser,
  failure,
  HttpError,
  json,
  requirePermission,
} from "../_shared/backend.ts"

function erpNextOrigin() {
  const value = Deno.env.get("ERPNEXT_BASE_URL")?.trim()
  if (!value) throw new HttpError(503, "ERPNext is not configured for this workspace.")

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new HttpError(503, "The ERPNext site URL is invalid.")
  }

  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new HttpError(503, "The ERPNext site URL must be a public HTTPS origin.")
  }

  return url.origin
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })

  try {
    if (request.method !== "GET") throw new HttpError(405, "Method not allowed.")

    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    await requirePermission(admin, current.User_ID, "Finance.Integration.Manage")

    const apiKey = Deno.env.get("ERPNEXT_API_KEY")?.trim()
    const apiSecret = Deno.env.get("ERPNEXT_API_SECRET")?.trim()
    if (!apiKey || !apiSecret) throw new HttpError(503, "ERPNext API credentials are not configured for this workspace.")

    const site = erpNextOrigin()
    const response = await fetch(`${site}/api/method/frappe.auth.get_logged_user`, {
      headers: {
        Accept: "application/json",
        Authorization: `token ${apiKey}:${apiSecret}`,
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.warn(JSON.stringify({ event: "erpnext_connection_check_failed", status: response.status }))
      throw new HttpError(502, "ERPNext rejected the connection check.")
    }

    console.info(JSON.stringify({ event: "erpnext_connection_check_succeeded", status: response.status }))
    return json(request, { provider: "erpnext", connected: true, endpoint: site })
  } catch (error) {
    return failure(request, error)
  }
})
