import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  buildDatabrainTicketPayload,
  mapDatabrainFailure,
  parseConfirmedTicketResponse,
} from "./contract.ts"
import { cloudSupportHeaders, containsCustomerSelector } from "./cloud-contract.ts"
import {
  cleanString,
  isEmail,
  isPlainObject,
  validateSupportTicketRequest,
  type JsonObject,
} from "./validation.ts"

const LEGACY_MAX_BODY_BYTES = 64 * 1024
const CLOUD_MAX_BODY_BYTES = 256 * 1024

type WorkspaceUser = {
  User_ID: string
  Company_ID: string | null
  User_Firstname: string | null
  User_Lastname: string | null
  User_Email: string
}

type ReporterContext = {
  workspaceUser: WorkspaceUser
  email: string
  name: string
  companyName: string | null
}

function corsHeaders(request: Request) {
  const configuredOrigin = Deno.env.get("APP_URL")?.trim() || "https://dev.multideck.app"
  const requestOrigin = request.headers.get("Origin")?.trim() ?? ""
  const allowedOrigins = new Set([configuredOrigin, "http://localhost:3000", "http://127.0.0.1:3000"])
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
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  })
}

function validationError(request: Request, message: string) {
  return json(request, { code: "validation_error", message }, 400)
}

function supportUnavailable(request: Request) {
  return json(request, {
    code: "support_service_unavailable",
    message: "Support is temporarily unavailable. Your ticket details are still here; try again.",
  }, 503)
}

async function handleLegacyTicket(request: Request, body: JsonObject, reporter: ReporterContext) {
  const ticketWebhookUrl = Deno.env.get("DATABRAIN_TICKET_WEBHOOK_URL")?.trim() ?? ""
  const ticketWebhookSecret = Deno.env.get("DATABRAIN_TICKET_WEBHOOK_SECRET")?.trim() ?? ""
  if (!ticketWebhookUrl.startsWith("https://") || ticketWebhookSecret.length < 16) {
    return supportUnavailable(request)
  }

  const validation = validateSupportTicketRequest(body)
  if (!validation.value) return validationError(request, validation.message)

  const databrainPayload = buildDatabrainTicketPayload(validation.value, {
    name: reporter.name,
    email: reporter.email,
    companyName: reporter.companyName,
  })
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)

  try {
    const upstream = await fetch(ticketWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Databrain-Webhook-Secret": ticketWebhookSecret,
      },
      body: JSON.stringify(databrainPayload),
      signal: controller.signal,
    })

    let upstreamBody: JsonObject = {}
    try {
      const parsed = await upstream.json()
      if (isPlainObject(parsed)) upstreamBody = parsed
    } catch {
      // A non-JSON upstream response is rejected below.
    }

    if (!upstream.ok) {
      const failure = mapDatabrainFailure(upstream.status)
      console.warn(
        "Databrain ticket intake rejected a request",
        upstream.status,
        cleanString(upstreamBody.error, 80) || "unknown",
      )
      return json(request, failure.body, failure.status)
    }

    const confirmed = parseConfirmedTicketResponse(upstreamBody)
    if (!confirmed) {
      return json(request, {
        code: "support_service_invalid_response",
        message: "Support did not confirm a ticket number. Your ticket details are still here; try again.",
      }, 502)
    }
    return json(request, confirmed.body, confirmed.status)
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return json(request, {
        code: "support_service_timeout",
        message: "Support took too long to respond. Your ticket details are still here; try again.",
      }, 504)
    }
    console.error("Databrain ticket intake could not be reached", error instanceof Error ? error.name : "unknown")
    const failure = mapDatabrainFailure(503)
    return json(request, failure.body, failure.status)
  } finally {
    clearTimeout(timeoutId)
  }
}

async function handleCloudTicket(request: Request, body: JsonObject, reporter: ReporterContext) {
  const cloudUrl = Deno.env.get("MULTIDECK_CLOUD_SUPPORT_URL")?.trim() ?? ""
  const cloudSigningPrivateKey = Deno.env.get("MULTIDECK_CLOUD_SUPPORT_SIGNING_PRIVATE_KEY")?.trim() ?? ""
  const cloudSigningKeyId = Deno.env.get("MULTIDECK_CLOUD_SUPPORT_KEY_ID")?.trim() ?? ""
  const tenantHost = Deno.env.get("MULTIDECK_TENANT_HOST")?.trim().toLowerCase() ?? ""
  if (
    !cloudUrl.startsWith("https://")
    || cloudSigningPrivateKey.length < 40
    || !/^[A-Za-z0-9._:-]{8,80}$/.test(cloudSigningKeyId)
    || !/^[a-z0-9-]+\.multideck\.app$/.test(tenantHost)
  ) {
    return supportUnavailable(request)
  }

  const action = cleanString(body.action, 40)
  if (!["create_draft", "prepare_attachment", "complete_attachment", "finalize", "list_tickets", "get_ticket", "add_comment"].includes(action)) {
    return validationError(request, "Choose a supported ticket action.")
  }

  // Reporter identity is derived from the authenticated tenant workspace for
  // every stage. Cloud combines it with the resolved machine credential, so a
  // browser cannot prepare, complete or finalise another reporter's draft.
  const cloudBody: JsonObject = { ...body, action, reporterUserId: reporter.workspaceUser.User_ID }
  if (action === "add_comment") {
    // Names and email addresses are evidence from the signed-in workspace,
    // never identity claims accepted from a browser comment.
    cloudBody.reporterName = reporter.name
    cloudBody.reporterEmail = reporter.email
  }
  if (action === "create_draft") {
    const submittedTicket = isPlainObject(body.ticket) ? body.ticket : {}
    const context = isPlainObject(submittedTicket.context) ? submittedTicket.context : {}
    cloudBody.ticket = {
      ...submittedTicket,
      reporterUserId: reporter.workspaceUser.User_ID,
      reporterName: reporter.name,
      reporterEmail: reporter.email,
      context: { ...context, companyName: reporter.companyName || undefined },
    }
  }

  const upstreamBody = JSON.stringify(cloudBody)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), action === "complete_attachment" ? 25_000 : 15_000)
  try {
    const signedHeaders = await cloudSupportHeaders(
      cloudSigningPrivateKey,
      cloudSigningKeyId,
      tenantHost,
      upstreamBody,
    )
    const upstream = await fetch(cloudUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...signedHeaders },
      body: upstreamBody,
      signal: controller.signal,
    })
    const payload = await upstream.json().catch(() => ({
      code: "support_service_invalid_response",
      message: "Support returned an invalid response.",
    })) as JsonObject
    if (!upstream.ok) {
      return json(request, {
        code: cleanString(payload.code, 80) || "support_service_unavailable",
        message: cleanString(payload.message, 500) || "Support is temporarily unavailable. Your ticket details are still here; try again.",
      }, upstream.status)
    }
    return json(request, payload, upstream.status)
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError"
    if (!timedOut) console.error("Cloud support request signing or delivery failed", error instanceof Error ? error.name : "unknown")
    return json(request, {
      code: timedOut ? "support_service_timeout" : "support_service_unavailable",
      message: timedOut
        ? "Support took too long to respond. Your ticket details are still here; try again."
        : "Support is temporarily unavailable. Your ticket details are still here; try again.",
    }, timedOut ? 504 : 503)
  } finally {
    clearTimeout(timeoutId)
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return json(request, { code: "method_not_allowed", message: "Method not allowed." }, 405)

  // This server-side flag is deliberately independent from browser input. It
  // defaults to the established Databrain intake and switches to Cloud only
  // after that tenant has been deliberately enabled during rollout.
  const cloudTicketingEnabled = Deno.env.get("MULTIDECK_CLOUD_SUPPORT_ENABLED")?.trim() === "true"
  const maximumBodyBytes = cloudTicketingEnabled ? CLOUD_MAX_BODY_BYTES : LEGACY_MAX_BODY_BYTES
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maximumBodyBytes) {
    return json(request, {
      code: "ticket_too_large",
      message: cloudTicketingEnabled ? "Ticket details are too large." : "Shorten the ticket details and try again.",
    }, 413)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return supportUnavailable(request)

  const authorization = request.headers.get("Authorization")?.trim() ?? ""
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return json(request, { code: "authentication_required", message: "Sign in again before creating a support ticket." }, 401)
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > maximumBodyBytes) {
    return json(request, {
      code: "ticket_too_large",
      message: cloudTicketingEnabled ? "Ticket details are too large." : "Shorten the ticket details and try again.",
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
  if (containsCustomerSelector(body)) {
    return json(request, {
      code: "customer_selector_forbidden",
      message: "Your workspace is assigned securely from this Multideck deployment. Remove the customer or tenant identifier and try again.",
    }, 400)
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
    return json(request, { code: "authentication_required", message: "Sign in again before creating a support ticket." }, 401)
  }

  const { data: workspaceUser, error: workspaceError } = await adminClient
    .from("cmp_Users")
    .select("User_ID,Company_ID,User_Firstname,User_Lastname,User_Email")
    .eq("Auth_User_ID", authData.user.id)
    .maybeSingle<WorkspaceUser>()
  if (workspaceError) {
    console.error("Support requester lookup failed", workspaceError.code ?? "unknown")
    return supportUnavailable(request)
  }
  if (!workspaceUser) {
    return json(request, {
      code: "workspace_profile_missing",
      message: "Your signed-in account is not connected to a Multideck workspace.",
    }, 403)
  }

  const email = cleanString(workspaceUser.User_Email || authData.user.email, 320).toLowerCase()
  if (!isEmail(email)) {
    return json(request, {
      code: "requester_email_missing",
      message: "Your signed-in account needs an email address before a ticket can be created.",
    }, 400)
  }
  const profileName = [workspaceUser.User_Firstname, workspaceUser.User_Lastname]
    .map((part) => cleanString(part, 80))
    .filter(Boolean)
    .join(" ")
  const metadataName = cleanString(authData.user.user_metadata?.full_name ?? authData.user.user_metadata?.name, 160)

  let companyName: string | null = null
  if (workspaceUser.Company_ID) {
    const { data: company, error: companyError } = await adminClient
      .from("cmp_Company")
      .select("Company_Name")
      .eq("Company_ID", workspaceUser.Company_ID)
      .maybeSingle<{ Company_Name: string }>()
    if (companyError) {
      console.error("Support company lookup failed", companyError.code ?? "unknown")
      return supportUnavailable(request)
    }
    companyName = cleanString(company?.Company_Name, 180) || null
  }

  const reporter: ReporterContext = {
    workspaceUser,
    email,
    name: profileName || metadataName || email,
    companyName,
  }
  return cloudTicketingEnabled
    ? handleCloudTicket(request, body, reporter)
    : handleLegacyTicket(request, body, reporter)
})
