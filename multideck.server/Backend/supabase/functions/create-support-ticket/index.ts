import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  cleanString,
  isEmail,
  isPlainObject,
  normalizeStatusUrl,
  validateSupportTicketRequest,
  type JsonObject,
} from "./validation.ts"

const MAX_BODY_BYTES = 64 * 1024

type WorkspaceUser = {
  User_ID: string
  Company_ID: string | null
  User_Firstname: string | null
  User_Lastname: string | null
  User_Email: string
}

function corsHeaders(request: Request) {
  const configuredOrigin = Deno.env.get("APP_URL")?.trim() || "https://dev.multideck.app"
  const requestOrigin = request.headers.get("Origin")?.trim() ?? ""
  const allowedOrigins = new Set([
    configuredOrigin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ])

  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigins.has(requestOrigin) ? requestOrigin : configuredOrigin,
    "Cache-Control": "no-store",
    "Vary": "Origin",
  }
}

function json(request: Request, body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}

function validationError(request: Request, message: string) {
  return json(request, { code: "validation_error", message }, 400)
}

function upstreamError(request: Request, status: number) {
  if (status === 400) {
    return validationError(request, "Check the ticket details and try again.")
  }
  if (status === 409) {
    return json(request, {
      code: "idempotency_conflict",
      message: "This ticket changed after it first reached support. Start a new ticket to send the updated details.",
    }, 409)
  }
  if (status === 413) {
    return json(request, {
      code: "ticket_too_large",
      message: "Shorten the ticket details and try again.",
    }, 413)
  }

  return json(request, {
    code: "support_service_unavailable",
    message: "Support is temporarily unavailable. Your ticket details are still here; try again.",
  }, 503)
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) })
  }
  if (request.method !== "POST") {
    return json(request, { code: "method_not_allowed", message: "Method not allowed." }, 405)
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(request, {
      code: "ticket_too_large",
      message: "Shorten the ticket details and try again.",
    }, 413)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  const ticketWebhookUrl = Deno.env.get("DATABRAIN_TICKET_WEBHOOK_URL")?.trim() ?? ""
  const ticketWebhookSecret = Deno.env.get("DATABRAIN_TICKET_WEBHOOK_SECRET")?.trim() ?? ""

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !ticketWebhookUrl || ticketWebhookSecret.length < 16) {
    return json(request, {
      code: "support_service_unavailable",
      message: "Support is temporarily unavailable. Your ticket details are still here; try again.",
    }, 503)
  }

  const authorization = request.headers.get("Authorization")?.trim() ?? ""
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return json(request, {
      code: "authentication_required",
      message: "Sign in again before creating a support ticket.",
    }, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) {
    return json(request, {
      code: "authentication_required",
      message: "Sign in again before creating a support ticket.",
    }, 401)
  }

  const { data: workspaceUser, error: workspaceError } = await adminClient
    .from("cmp_Users")
    .select("User_ID,Company_ID,User_Firstname,User_Lastname,User_Email")
    .eq("Auth_User_ID", authData.user.id)
    .maybeSingle<WorkspaceUser>()

  if (workspaceError) {
    console.error("Support requester lookup failed", workspaceError.code ?? "unknown")
    return json(request, {
      code: "support_service_unavailable",
      message: "Support is temporarily unavailable. Your ticket details are still here; try again.",
    }, 503)
  }
  if (!workspaceUser) {
    return json(request, {
      code: "workspace_profile_missing",
      message: "Your signed-in account is not connected to a Multideck workspace.",
    }, 403)
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json(request, {
      code: "ticket_too_large",
      message: "Shorten the ticket details and try again.",
    }, 413)
  }

  let body: JsonObject
  try {
    const parsed = JSON.parse(rawBody || "null")
    if (!isPlainObject(parsed)) return validationError(request, "Check the ticket details and try again.")
    body = parsed
  } catch {
    return validationError(request, "Check the ticket details and try again.")
  }

  const validation = validateSupportTicketRequest(body)
  if (!validation.value) return validationError(request, validation.message)
  const {
    idempotencyKey,
    topic,
    title,
    description,
    priority: normalizedPriority,
    applicationUrl,
  } = validation.value

  const requesterEmail = cleanString(workspaceUser.User_Email || authData.user.email, 320).toLowerCase()
  if (!isEmail(requesterEmail)) {
    return json(request, {
      code: "requester_email_missing",
      message: "Your signed-in account needs an email address before a ticket can be created.",
    }, 400)
  }

  const profileName = [workspaceUser.User_Firstname, workspaceUser.User_Lastname]
    .map((part) => cleanString(part, 80))
    .filter(Boolean)
    .join(" ")
  const metadataName = cleanString(
    authData.user.user_metadata?.full_name ?? authData.user.user_metadata?.name,
    160,
  )
  const requesterName = profileName || metadataName || requesterEmail

  let companyName: string | null = null
  if (workspaceUser.Company_ID) {
    const { data: company, error: companyError } = await adminClient
      .from("cmp_Company")
      .select("Company_Name")
      .eq("Company_ID", workspaceUser.Company_ID)
      .maybeSingle<{ Company_Name: string }>()

    if (companyError) {
      console.error("Support company lookup failed", companyError.code ?? "unknown")
      return json(request, {
        code: "support_service_unavailable",
        message: "Support is temporarily unavailable. Your ticket details are still here; try again.",
      }, 503)
    }
    companyName = cleanString(company?.Company_Name, 180) || null
  }

  const metadata: Record<string, string> = {
    topic,
    requestedPriority: normalizedPriority,
  }
  if (applicationUrl) metadata.applicationUrl = applicationUrl

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  let upstream: Response

  try {
    upstream = await fetch(ticketWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Databrain-Webhook-Secret": ticketWebhookSecret,
      },
      body: JSON.stringify({
        idempotencyKey,
        sourceApplication: "multideck",
        title,
        description,
        requester: {
          name: requesterName,
          email: requesterEmail,
        },
        clientName: companyName,
        categorySlug: "general",
        priority: normalizedPriority,
        metadata,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return json(request, {
        code: "support_service_timeout",
        message: "Support took too long to respond. Your ticket details are still here; try again.",
      }, 504)
    }

    console.error("Databrain ticket intake could not be reached", error instanceof Error ? error.name : "unknown")
    return upstreamError(request, 503)
  } finally {
    clearTimeout(timeoutId)
  }

  let upstreamBody: JsonObject = {}
  try {
    const parsed = await upstream.json()
    if (isPlainObject(parsed)) upstreamBody = parsed
  } catch {
    // A non-JSON upstream response is handled as an invalid response below.
  }

  if (!upstream.ok) {
    console.warn(
      "Databrain ticket intake rejected a request",
      upstream.status,
      cleanString(upstreamBody.error, 80) || "unknown",
    )
    return upstreamError(request, upstream.status)
  }

  const ticket = isPlainObject(upstreamBody.ticket) ? upstreamBody.ticket : {}
  const ticketNumber = cleanString(ticket.ticketNumber, 80)
  const createdAt = cleanString(ticket.createdAt, 80)
  if (!ticketNumber || !createdAt) {
    return json(request, {
      code: "support_service_invalid_response",
      message: "Support did not confirm a ticket number. Your ticket details are still here; try again.",
    }, 502)
  }

  return json(request, {
    ticket: {
      ticketNumber,
      status: cleanString(ticket.status, 40) || "open",
      createdAt,
      statusUrl: normalizeStatusUrl(ticket.statusUrl),
    },
    duplicate: upstreamBody.duplicate === true,
  }, upstreamBody.duplicate === true ? 200 : 201)
})
