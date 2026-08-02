import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  assertAllowedOrigin,
  assertSafeReturnPath,
  buildAuthorizationUrl,
  cleanString,
  createPkce,
  createSignedState,
  deleteSecret,
  exchangeAuthorizationCode,
  failureRedirect,
  fetchProviderIdentity,
  getSecret,
  isEmailAccessMode,
  isEmailProvider,
  isPlainObject,
  providerAuthorizationErrorCode,
  providerScopes,
  publicOAuthErrorCode,
  putSecret,
  readAllowedOrigins,
  readProviderConfig,
  requestedScopes,
  readSigningSecret,
  sha256,
  successRedirect,
  verifySignedState,
  type EmailProvider,
} from "./core.ts"

type JsonObject = Record<string, unknown>

type OAuthStateRow = {
  oauth_state_id: string
  provider_code: EmailProvider
  user_id: string
  auth_user_id: string
  return_path: string
  pkce_verifier_secret_ref: string
  requested_scopes: unknown
}

const MAX_BODY_BYTES = 16 * 1024

function environment() {
  return {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    APP_URL: Deno.env.get("APP_URL"),
    EMAIL_ALLOWED_REDIRECT_ORIGINS: Deno.env.get("EMAIL_ALLOWED_REDIRECT_ORIGINS"),
    EMAIL_CANONICAL_APP_ORIGIN: Deno.env.get("EMAIL_CANONICAL_APP_ORIGIN"),
    EMAIL_OAUTH_CALLBACK_URL: Deno.env.get("EMAIL_OAUTH_CALLBACK_URL"),
    EMAIL_OAUTH_STATE_SIGNING_SECRET: Deno.env.get("EMAIL_OAUTH_STATE_SIGNING_SECRET"),
    GMAIL_CLIENT_ID: Deno.env.get("GMAIL_CLIENT_ID"),
    GMAIL_CLIENT_SECRET: Deno.env.get("GMAIL_CLIENT_SECRET"),
    MICROSOFT_CLIENT_ID: Deno.env.get("MICROSOFT_CLIENT_ID"),
    MICROSOFT_CLIENT_SECRET: Deno.env.get("MICROSOFT_CLIENT_SECRET"),
    MICROSOFT_TENANT_ID: Deno.env.get("MICROSOFT_TENANT_ID"),
  }
}

function corsHeaders(request: Request, allowedOrigins: Set<string>) {
  const origin = request.headers.get("Origin")?.trim() ?? ""
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  }
  if (allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

function json(request: Request, allowedOrigins: Set<string>, body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, allowedOrigins),
      "Content-Type": "application/json; charset=utf-8",
    },
  })
}

function errorResponse(request: Request, allowedOrigins: Set<string>, code: string, status = 400) {
  const copy: Record<string, string> = {
    authentication_required: "Sign in again before connecting an email account.",
    request_invalid: "Check the email connection request and try again.",
    redirect_origin_not_allowed: "This workspace address is not approved for email connections.",
    return_path_not_allowed: "The return location is not approved.",
    provider_not_configured: "This email provider is not configured for this workspace.",
    oauth_configuration_missing: "Email connections are not configured for this workspace.",
    secret_store_unavailable: "Secure credential storage is unavailable. No email account was connected.",
    workspace_profile_missing: "Your signed-in account is not linked to this workspace.",
    email_connect_denied: "You do not have permission to connect an email account in this workspace.",
    oauth_state_invalid: "This email connection request is invalid or has already been used.",
    oauth_state_expired: "This email connection request expired. Start the connection again.",
    oauth_provider_mismatch: "The email provider did not match the connection request.",
    provider_authorization_denied: "The email provider did not approve the connection.",
    provider_admin_consent_required: "Your Microsoft 365 organisation requires an administrator to approve Multideck before this mailbox can be connected.",
    provider_token_exchange_failed: "The email provider could not complete the connection.",
    provider_refresh_token_missing: "The provider did not grant durable mailbox access. Try connecting again.",
    provider_identity_lookup_failed: "The connected mailbox could not be identified.",
    connection_save_failed: "The mailbox connection could not be saved securely.",
    service_unavailable: "Email connections are temporarily unavailable.",
  }
  const publicCode = publicOAuthErrorCode(code)
  return json(request, allowedOrigins, { code: publicCode, message: copy[publicCode] ?? copy.service_unavailable }, status)
}

function requiredRuntime(environmentValues: ReturnType<typeof environment>) {
  const supabaseUrl = cleanString(environmentValues.SUPABASE_URL, 1000)
  const anonKey = cleanString(environmentValues.SUPABASE_ANON_KEY, 4000)
  const serviceRoleKey = cleanString(environmentValues.SUPABASE_SERVICE_ROLE_KEY, 4000)
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("service_unavailable")
  return { supabaseUrl, anonKey, serviceRoleKey }
}

async function readJsonBody(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error("request_invalid")
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("request_invalid")
  const parsed = JSON.parse(raw || "null")
  if (!isPlainObject(parsed)) throw new Error("request_invalid")
  return parsed
}

function firstRow(value: unknown): OAuthStateRow | null {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!isPlainObject(candidate)) return null
  const provider = candidate.provider_code
  const row: OAuthStateRow = {
    oauth_state_id: cleanString(candidate.oauth_state_id, 80),
    provider_code: isEmailProvider(provider) ? provider : "gmail",
    user_id: cleanString(candidate.user_id, 80),
    auth_user_id: cleanString(candidate.auth_user_id, 80),
    return_path: cleanString(candidate.return_path, 500),
    pkce_verifier_secret_ref: cleanString(candidate.pkce_verifier_secret_ref, 240),
    requested_scopes: candidate.requested_scopes,
  }
  return row.oauth_state_id && isEmailProvider(provider) && row.user_id && row.auth_user_id &&
      row.pkce_verifier_secret_ref
    ? row
    : null
}

async function beginAuthorization(request: Request, allowedOrigins: Set<string>) {
  const env = environment()
  const runtime = requiredRuntime(env)
  const authorization = request.headers.get("Authorization")?.trim() ?? ""
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return errorResponse(request, allowedOrigins, "authentication_required", 401)
  }

  let body: JsonObject
  try {
    body = await readJsonBody(request)
  } catch {
    return errorResponse(request, allowedOrigins, "request_invalid", 400)
  }
  if (body.action !== "authorize" || !isEmailProvider(body.provider)) {
    return errorResponse(request, allowedOrigins, "request_invalid", 400)
  }

  let returnOrigin: string
  let returnPath: string
  try {
    returnOrigin = assertAllowedOrigin(body.returnOrigin, allowedOrigins)
    returnPath = assertSafeReturnPath(body.returnPath)
    const requestOrigin = request.headers.get("Origin")?.trim()
    if (requestOrigin && requestOrigin !== returnOrigin) throw new Error("redirect_origin_not_allowed")
  } catch (error) {
    const code = error instanceof Error ? error.message : "request_invalid"
    return errorResponse(request, allowedOrigins, code, 400)
  }

  const userClient = createClient(runtime.supabaseUrl, runtime.anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const adminClient = createClient(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) {
    return errorResponse(request, allowedOrigins, "authentication_required", 401)
  }

  const provider = body.provider
  const accessMode = body.accessMode === undefined ? "personal" : body.accessMode
  if (!isEmailAccessMode(accessMode) || (provider === "gmail" && accessMode !== "personal")) {
    return errorResponse(request, allowedOrigins, "request_invalid", 400)
  }
  const scopes = providerScopes(provider, accessMode)
  let signingSecret: string
  let providerConfig: ReturnType<typeof readProviderConfig>
  try {
    signingSecret = readSigningSecret(env.EMAIL_OAUTH_STATE_SIGNING_SECRET)
    providerConfig = readProviderConfig(provider, env)
  } catch (error) {
    const code = error instanceof Error ? error.message : "service_unavailable"
    return errorResponse(request, allowedOrigins, code, 503)
  }

  const { verifier, challenge } = await createPkce()
  const state = await createSignedState(provider, returnOrigin, signingSecret)
  const stateHash = await sha256(state)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  let verifierSecretRef = ""
  const secretRpc = async (functionName: string, parameters: Record<string, unknown>) => {
    const { data, error } = await adminClient.rpc(functionName, parameters)
    return { data, error }
  }
  try {
    verifierSecretRef = await putSecret(secretRpc, "email-oauth-pkce", verifier)
    const { data, error } = await adminClient.rpc("comm_begin_email_oauth_state", {
      p_state_hash: stateHash,
      p_provider_code: provider,
      p_auth_user_id: userData.user.id,
      p_return_path: returnPath,
      p_pkce_verifier_secret_ref: verifierSecretRef,
      p_requested_scopes: scopes,
    })
    if (error || !cleanString(data, 80)) {
      await deleteSecret(secretRpc, verifierSecretRef).catch(() => undefined)
      const code = error?.code === "P0002"
        ? "workspace_profile_missing"
        : error?.code === "42501"
        ? "email_connect_denied"
        : "service_unavailable"
      return errorResponse(request, allowedOrigins, code, code === "service_unavailable" ? 503 : 403)
    }
  } catch (error) {
    if (verifierSecretRef) await deleteSecret(secretRpc, verifierSecretRef).catch(() => undefined)
    const code = error instanceof Error ? error.message : "service_unavailable"
    return errorResponse(request, allowedOrigins, code, 503)
  }

  return json(request, allowedOrigins, {
    authorizationUrl: buildAuthorizationUrl(providerConfig, state, challenge, accessMode),
    provider,
    expiresAt,
  })
}

async function completeAuthorization(request: Request, allowedOrigins: Set<string>) {
  const env = environment()
  let runtime: ReturnType<typeof requiredRuntime>
  let signingSecret: string
  try {
    runtime = requiredRuntime(env)
    signingSecret = readSigningSecret(env.EMAIL_OAUTH_STATE_SIGNING_SECRET)
  } catch (error) {
    const code = error instanceof Error ? error.message : "service_unavailable"
    return errorResponse(request, allowedOrigins, code, 503)
  }

  const url = new URL(request.url)
  const rawState = cleanString(url.searchParams.get("state"), 4_000)
  if (!rawState) return errorResponse(request, allowedOrigins, "oauth_state_invalid", 400)

  let signedState: Awaited<ReturnType<typeof verifySignedState>>
  try {
    signedState = await verifySignedState(rawState, signingSecret, allowedOrigins)
  } catch (error) {
    const code = error instanceof Error ? error.message : "oauth_state_invalid"
    return errorResponse(request, allowedOrigins, code, 400)
  }

  const adminClient = createClient(runtime.supabaseUrl, runtime.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const secretRpc = async (functionName: string, parameters: Record<string, unknown>) => {
    const { data, error } = await adminClient.rpc(functionName, parameters)
    return { data, error }
  }
  const { data: consumedData, error: consumeError } = await adminClient.rpc(
    "comm_consume_email_oauth_state",
    { p_state_hash: await sha256(rawState) },
  )
  const stateRow = firstRow(consumedData)
  if (consumeError || !stateRow) {
    return errorResponse(request, allowedOrigins, "oauth_state_invalid", 400)
  }
  if (stateRow.provider_code !== signedState.provider) {
    await deleteSecret(secretRpc, stateRow.pkce_verifier_secret_ref).catch(() => undefined)
    return errorResponse(request, allowedOrigins, "oauth_provider_mismatch", 400)
  }

  const provider = signedState.provider
  const providerError = cleanString(url.searchParams.get("error"), 120)
  const providerErrorDescription = cleanString(url.searchParams.get("error_description"), 500)
  if (providerError) {
    await deleteSecret(secretRpc, stateRow.pkce_verifier_secret_ref).catch(() => undefined)
    // Provider details are never reflected into the redirect or logs. Known
    // Microsoft admin-consent failures become one fixed, actionable code.
    const errorCode = providerAuthorizationErrorCode(provider, providerError, providerErrorDescription)
    return Response.redirect(
      failureRedirect(signedState.returnOrigin, stateRow.return_path, provider, errorCode),
      303,
    )
  }

  const code = cleanString(url.searchParams.get("code"), 8_000)
  if (!code) {
    await deleteSecret(secretRpc, stateRow.pkce_verifier_secret_ref).catch(() => undefined)
    return Response.redirect(
      failureRedirect(signedState.returnOrigin, stateRow.return_path, provider, "provider_authorization_denied"),
      303,
    )
  }

  let providerConfig: ReturnType<typeof readProviderConfig>
  let verifier: string
  try {
    providerConfig = readProviderConfig(provider, env)
    verifier = await getSecret(secretRpc, stateRow.pkce_verifier_secret_ref)
  } catch (error) {
    await deleteSecret(secretRpc, stateRow.pkce_verifier_secret_ref).catch(() => undefined)
    const errorCode = error instanceof Error ? error.message : "service_unavailable"
    return Response.redirect(
      failureRedirect(signedState.returnOrigin, stateRow.return_path, provider, errorCode),
      303,
    )
  }

  let tokenSecretRef = ""
  try {
    const connectionScopes = requestedScopes(provider, stateRow.requested_scopes)
    const tokens = await exchangeAuthorizationCode(providerConfig, code, verifier, connectionScopes)
    const identity = await fetchProviderIdentity(providerConfig, tokens)
    tokenSecretRef = await putSecret(
      secretRpc,
      "email-provider-token",
      JSON.stringify({
        version: 1,
        provider,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
        expiresAt: tokens.expiresAt,
        providerAccountId: identity.providerAccountId,
        providerTenantId: identity.providerTenantId,
      }),
    )

    const grantedScopes = tokens.scope.split(/\s+/).filter(Boolean)
    const { data, error } = await adminClient.rpc("comm_complete_email_oauth_connection", {
      p_oauth_state_id: stateRow.oauth_state_id,
      p_provider_type_code: provider === "gmail" ? "google_workspace" : "microsoft_365",
      p_connection_name: `${provider === "gmail" ? "Gmail" : "Outlook"} — ${identity.mailboxAddress}`,
      p_secret_ref: tokenSecretRef,
      p_provider_tenant_id: identity.providerTenantId,
      p_provider_account_id: identity.providerAccountId,
      p_mailbox_display_name: identity.mailboxDisplayName,
      p_mailbox_address: identity.mailboxAddress,
      p_provider_mailbox_id: identity.providerMailboxId,
      p_mailbox_type_code: "personal",
      p_scopes: grantedScopes,
    })
    if (error || !data) throw new Error("connection_save_failed")
    const completed = Array.isArray(data) ? data[0] : data
    const replacedSecretRef = isPlainObject(completed)
      ? cleanString(completed.replaced_secret_ref, 240)
      : ""
    if (replacedSecretRef && replacedSecretRef !== tokenSecretRef) {
      await deleteSecret(secretRpc, replacedSecretRef).catch(() => undefined)
    }
  } catch (error) {
    if (tokenSecretRef) await deleteSecret(secretRpc, tokenSecretRef).catch(() => undefined)
    const errorCode = error instanceof Error ? error.message : "connection_save_failed"
    return Response.redirect(
      failureRedirect(signedState.returnOrigin, stateRow.return_path, provider, errorCode),
      303,
    )
  } finally {
    await deleteSecret(secretRpc, stateRow.pkce_verifier_secret_ref).catch(() => undefined)
  }

  return Response.redirect(successRedirect(signedState.returnOrigin, stateRow.return_path, provider), 303)
}

Deno.serve(async (request) => {
  const allowedOrigins = readAllowedOrigins(environment())
  if (allowedOrigins.size === 0) {
    return errorResponse(request, allowedOrigins, "oauth_configuration_missing", 503)
  }
  if (request.method === "OPTIONS") {
    const requestOrigin = request.headers.get("Origin")?.trim() ?? ""
    return allowedOrigins.has(requestOrigin)
      ? new Response(null, { status: 204, headers: corsHeaders(request, allowedOrigins) })
      : errorResponse(request, allowedOrigins, "redirect_origin_not_allowed", 403)
  }
  if (request.method === "POST") return await beginAuthorization(request, allowedOrigins)
  if (request.method === "GET") return await completeAuthorization(request, allowedOrigins)
  return errorResponse(request, allowedOrigins, "request_invalid", 405)
})
