import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { adminClient, authenticate, currentInternalUser, HttpError, isTrustedMultideckOrigin, json, permissionValues, routeParts } from "../_shared/backend.ts"
import { hmrcVatAuthorisationUrl, hmrcVatCodeExchangeBody, hmrcVatEndpoints, hmrcVatRefreshBody, parseHmrcVatToken, type HmrcVatEnvironment } from "../_shared/hmrc-vat-oauth.mts"

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function projectRef() {
  const configured = Deno.env.get("SUPABASE_URL")?.trim()
  if (!configured) throw new HttpError(503, "The tenant backend identity is not configured.")
  const url = new URL(configured)
  if (!url.hostname || (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new HttpError(503, "The tenant backend identity is invalid.")
  }
  return url.host
}

function appReturnUrl(outcome: "connected" | "error", reason?: string) {
  const configured = Deno.env.get("APP_URL")?.trim()
  if (!configured || !isTrustedMultideckOrigin(configured)) throw new HttpError(503, "The tenant App return address is not configured.")
  const url = new URL("/finance/vat", configured)
  url.searchParams.set("vat_connection", outcome)
  if (reason) url.searchParams.set("reason", reason)
  return url.toString()
}

function environment(value: unknown): HmrcVatEnvironment {
  if (value === "sandbox" || value === "production") return value
  throw new HttpError(400, "Choose the HMRC sandbox or production environment.")
}

function credentials(value: HmrcVatEnvironment) {
  if (value === "production" && Deno.env.get("HMRC_VAT_PRODUCTION_ENABLED") !== "true") {
    throw new HttpError(409, "HMRC production access is not enabled for this tenant.")
  }
  const prefix = value === "sandbox" ? "HMRC_VAT_SANDBOX" : "HMRC_VAT_PRODUCTION"
  const clientId = Deno.env.get(`${prefix}_CLIENT_ID`)?.trim()
  const clientSecret = Deno.env.get(`${prefix}_CLIENT_SECRET`)?.trim()
  const redirectUri = Deno.env.get(`${prefix}_REDIRECT_URI`)?.trim()
  if (!clientId || !clientSecret || !redirectUri) throw new HttpError(503, "HMRC VAT application credentials are not configured for this environment.")
  const uri = new URL(redirectUri)
  if (uri.protocol !== "https:" || uri.hash || uri.username || uri.password) throw new HttpError(503, "The HMRC callback address is invalid.")
  return { clientId, clientSecret, redirectUri }
}

function base64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function randomValue(length: number) { return base64Url(crypto.getRandomValues(new Uint8Array(length))) }

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function codeChallenge(verifier: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))
}

async function requireFinancePermission(admin: SupabaseClient, actorId: string, permission: string) {
  if (!(await permissionValues(admin, actorId)).includes(permission)) throw new HttpError(403, "You do not have access to this HMRC VAT connection.")
}

async function start(request: Request, admin: SupabaseClient) {
  const { user } = await authenticate(request, admin)
  const actor = await currentInternalUser(admin, user)
  await requireFinancePermission(admin, actor.User_ID, "Finance.Compliance.Manage")
  const input = await request.json().catch(() => null) as { legalEntityId?: unknown; environment?: unknown } | null
  const entityId = typeof input?.legalEntityId === "string" ? input.legalEntityId : ""
  if (!uuidPattern.test(entityId)) throw new HttpError(400, "Choose a UK legal entity.")
  const selectedEnvironment = environment(input?.environment)
  const config = credentials(selectedEnvironment)
  appReturnUrl("error")
  const state = randomValue(32)
  const verifier = randomValue(64)
  const { error } = await admin.rpc("multideck_hmrc_vat_begin", {
    p_actor: actor.User_ID, p_auth_user: user.id, p_entity: entityId,
    p_project_ref: projectRef(), p_environment: selectedEnvironment,
    p_state_hash: await sha256Hex(state), p_pkce_verifier: verifier,
    p_redirect_uri: config.redirectUri,
  })
  if (error) throw new HttpError(error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503,
    error.code === "42501" ? "HMRC VAT connection is not authorised for this legal entity." : "HMRC VAT connection could not be started.")
  return json(request, {
    authorizationUrl: hmrcVatAuthorisationUrl({
      environment: selectedEnvironment, clientId: config.clientId,
      redirectUri: config.redirectUri, state, codeChallenge: await codeChallenge(verifier),
    }),
  })
}

async function deny(admin: SupabaseClient, stateHash: string) {
  if (!stateHash) return
  const { error } = await admin.rpc("multideck_hmrc_vat_deny", { p_state_hash: stateHash, p_project_ref: projectRef() })
  if (error) console.error("HMRC VAT consent state cleanup failed")
}

async function callback(request: Request, admin: SupabaseClient) {
  const url = new URL(request.url)
  const state = url.searchParams.get("state") ?? ""
  const code = url.searchParams.get("code") ?? ""
  if (!state || state.length > 300) return Response.redirect(appReturnUrl("error", "state_invalid"), 303)
  const stateHash = await sha256Hex(state)
  if (url.searchParams.has("error") || !code || code.length > 4000) {
    await deny(admin, stateHash)
    return Response.redirect(appReturnUrl("error", "consent_not_granted"), 303)
  }
  const { data: claim, error: claimError } = await admin.rpc("multideck_hmrc_vat_claim", {
    p_state_hash: stateHash, p_project_ref: projectRef(),
  })
  if (claimError || !claim) return Response.redirect(appReturnUrl("error", "state_expired_or_access_changed"), 303)
  try {
    const selectedEnvironment = environment(claim.environment)
    const config = credentials(selectedEnvironment)
    if (config.redirectUri !== claim.redirectUri) throw new Error("HMRC callback configuration changed.")
    const response = await fetch(hmrcVatEndpoints(selectedEnvironment).token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: hmrcVatCodeExchangeBody({
        clientId: config.clientId, clientSecret: config.clientSecret,
        redirectUri: config.redirectUri, code, verifier: claim.codeVerifier,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error("HMRC rejected the code exchange.")
    const tokens = parseHmrcVatToken(await response.json())
    const { error: completionError } = await admin.rpc("multideck_hmrc_vat_complete", {
      p_state_id: claim.stateId, p_project_ref: projectRef(),
      p_token_bundle: tokens.bundle, p_expires_in: tokens.expiresIn, p_scope: tokens.scope,
    })
    if (completionError) throw new Error("HMRC authority could not be secured.")
    return Response.redirect(appReturnUrl("connected"), 303)
  } catch {
    await deny(admin, stateHash)
    return Response.redirect(appReturnUrl("error", "connection_failed"), 303)
  }
}

async function status(request: Request, admin: SupabaseClient, entityId: string) {
  const { user } = await authenticate(request, admin)
  const actor = await currentInternalUser(admin, user)
  await requireFinancePermission(admin, actor.User_ID, "Finance.Compliance.View")
  if (!uuidPattern.test(entityId)) throw new HttpError(400, "Choose a UK legal entity.")
  const { data, error } = await admin.rpc("multideck_hmrc_vat_connection_status", {
    p_actor: actor.User_ID, p_entity: entityId, p_project_ref: projectRef(),
  })
  if (error) throw new HttpError(error.code === "42501" ? 403 : 503, "HMRC VAT connection status could not be read.")
  return json(request, data)
}

async function refresh(request: Request, admin: SupabaseClient) {
  const { user } = await authenticate(request, admin)
  const actor = await currentInternalUser(admin, user)
  await requireFinancePermission(admin, actor.User_ID, "Finance.Compliance.Manage")
  const input = await request.json().catch(() => null) as { legalEntityId?: unknown; connectionId?: unknown } | null
  const entityId = typeof input?.legalEntityId === "string" ? input.legalEntityId : ""
  const connectionId = typeof input?.connectionId === "string" ? input.connectionId : ""
  if (!uuidPattern.test(entityId) || !uuidPattern.test(connectionId)) throw new HttpError(400, "Choose an HMRC VAT connection for this UK legal entity.")
  const tenantRef = projectRef()
  const { data: claim, error: claimError } = await admin.rpc("multideck_hmrc_vat_claim_refresh", {
    p_actor: actor.User_ID, p_entity: entityId, p_project_ref: tenantRef, p_connection: connectionId,
  })
  if (claimError) throw new HttpError(claimError.code === "42501" ? 403 : claimError.code === "P0002" ? 404 : 503,
    "HMRC VAT refresh could not be started.")
  if (claim.status !== "claimed") return json(request, { status: claim.status, accessExpiresAt: claim.accessExpiresAt })
  const leaseId = claim.leaseId as string
  let reason = "refresh_outcome_unknown"
  try {
    const selectedEnvironment = environment(claim.environment)
    const config = credentials(selectedEnvironment)
    const response = await fetch(hmrcVatEndpoints(selectedEnvironment).token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: hmrcVatRefreshBody({ clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: claim.refreshToken }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      reason = "refresh_rejected"
      throw new Error("HMRC rejected token renewal.")
    }
    const tokens = parseHmrcVatToken(await response.json(), { allowMissingScope: true })
    const { data, error } = await admin.rpc("multideck_hmrc_vat_finish_refresh", {
      p_actor: actor.User_ID, p_entity: entityId, p_project_ref: tenantRef,
      p_connection: connectionId, p_lease: leaseId, p_token_bundle: tokens.bundle,
      p_expires_in: tokens.expiresIn, p_scope: tokens.scope,
    })
    if (error) throw new Error("HMRC VAT token rotation could not be secured.")
    return json(request, data)
  } catch {
    const { error } = await admin.rpc("multideck_hmrc_vat_fail_refresh", {
      p_actor: actor.User_ID, p_entity: entityId, p_project_ref: tenantRef,
      p_connection: connectionId, p_lease: leaseId, p_reason: reason,
    })
    if (error) console.error("HMRC VAT refresh state could not be closed")
    return json(request, { status: "reauthorisation_required" })
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(request, {}, 204)
  try {
    const admin = adminClient()
    const parts = routeParts(request, "hmrc-vat-oauth")
    if (request.method === "POST" && parts.length === 1 && parts[0] === "start") return await start(request, admin)
    if (request.method === "POST" && parts.length === 1 && parts[0] === "refresh") return await refresh(request, admin)
    if (request.method === "GET" && parts.length === 1 && parts[0] === "callback") return await callback(request, admin)
    if (request.method === "GET" && parts.length === 2 && parts[0] === "status") return await status(request, admin, parts[1])
    throw new HttpError(404, "HMRC VAT connection route not found.")
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    return json(request, { detail: error instanceof HttpError ? error.message : "HMRC VAT connection could not be completed." }, status)
  }
})
