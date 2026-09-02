import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { adminClient, authenticate, currentInternalUser, HttpError, isTrustedMultideckOrigin, json, permissionValues, routeParts } from "../_shared/backend.ts"
import { cleanText, randomToken, sha256 } from "../_shared/calendar.ts"

type Provider = "google" | "microsoft" | "zoom"
type JsonObject = Record<string, unknown>

class ProviderOAuthError extends HttpError {
  readonly reason: string

  constructor(reason: string, message: string) {
    super(400, message)
    this.reason = reason
  }
}

const providerScopes: Record<Provider, string[]> = {
  google: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"],
  microsoft: ["openid", "profile", "email", "offline_access", "User.Read", "Calendars.ReadWrite"],
  zoom: ["meeting:write:meeting", "meeting:read:meeting", "meeting:update:meeting", "meeting:delete:meeting", "user:read:user"],
}

function providerValue(value: unknown): Provider {
  if (value === "google" || value === "microsoft" || value === "zoom") return value
  throw new HttpError(400, "Choose Google Calendar, Microsoft Calendar or Zoom.")
}

function config(provider: Provider) {
  const prefix = provider === "google" ? "GOOGLE_CALENDAR" : provider === "microsoft" ? "MICROSOFT_CALENDAR" : "ZOOM"
  const clientId = Deno.env.get(`${prefix}_CLIENT_ID`)?.trim()
  const clientSecret = Deno.env.get(`${prefix}_CLIENT_SECRET`)?.trim()
  const callbackUrl = Deno.env.get(`${prefix}_REDIRECT_URI`)?.trim()
  if (!clientId || !clientSecret || !callbackUrl) {
    const missing = [!clientId ? "client ID" : "", !clientSecret ? "client secret" : "", !callbackUrl ? "callback" : ""].filter(Boolean)
    throw new HttpError(503, `${provider === "microsoft" ? "Microsoft Calendar" : provider === "google" ? "Google Calendar" : "Zoom"} connection setup is incomplete (${missing.join(", ")} missing).`)
  }
  return { clientId, clientSecret, callbackUrl }
}

function base64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

async function challenge(verifier: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))))
}

async function putSecret(admin: SupabaseClient, name: string, value: string) {
  const { data, error } = await admin.rpc("calendar_put_secret", { p_secret: value, p_name: name, p_description: "Multideck Calendar OAuth credential" })
  if (error || typeof data !== "string") throw new HttpError(503, "The calendar credential could not be secured.")
  return data
}

async function getSecret(admin: SupabaseClient, reference: string) {
  const { data, error } = await admin.rpc("calendar_get_secret", { p_secret_ref: reference })
  if (error || typeof data !== "string") throw new HttpError(400, "This connection attempt has expired.")
  return data
}

async function deleteSecret(admin: SupabaseClient, reference: string | null | undefined) {
  if (!reference) return
  const { error } = await admin.rpc("calendar_delete_secret", { p_secret_ref: reference })
  if (error) console.error("Calendar OAuth secret cleanup failed", { secretRef: reference })
}

function redirectError(origin: string, path: string, code: string) {
  const url = new URL(path, origin)
  url.searchParams.set("calendar_connection", "error")
  url.searchParams.set("reason", code)
  return Response.redirect(url.toString(), 303)
}

async function start(request: Request, admin: SupabaseClient, provider: Provider) {
  const { user } = await authenticate(request, admin)
  const actor = await currentInternalUser(admin, user)
  if (!(await permissionValues(admin, actor.User_ID)).includes("Calendar.Connect")) throw new HttpError(403, "You do not have permission to connect a personal calendar.")
  const origin = cleanText(request.headers.get("Origin"), 500)
  if (!origin || !isTrustedMultideckOrigin(origin)) throw new HttpError(400, "Return to Multideck from an approved workspace address.")
  const url = new URL(request.url)
  const returnPath = cleanText(url.searchParams.get("returnPath"), 500) || "/settings?tab=integrations"
  if (!returnPath.startsWith("/") || returnPath.startsWith("//")) throw new HttpError(400, "The return page is not valid.")
  const state = randomToken(36)
  const verifier = randomToken(64)
  const verifierRef = await putSecret(admin, `calendar-oauth-pkce-${provider}-${crypto.randomUUID()}`, verifier)
  const { error } = await admin.from("CAL_OAuthStates").insert({
    CALOAuthState_CompanyID: actor.Company_ID,
    CALOAuthState_UserID: actor.User_ID,
    CALOAuthState_AuthUserID: user.id,
    CALOAuthState_ProviderCode: provider,
    CALOAuthState_StateHash: await sha256(state),
    CALOAuthState_PKCESecretRef: verifierRef,
    CALOAuthState_ReturnOrigin: origin,
    CALOAuthState_ReturnPath: returnPath,
    CALOAuthState_RequestedScopesJSON: providerScopes[provider],
    CALOAuthState_ExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  })
  if (error) {
    await deleteSecret(admin, verifierRef)
    throw new HttpError(500, "The connection could not be started.")
  }
  const credentials = config(provider)
  let authorise: URL
  if (provider === "google") {
    authorise = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    authorise.search = new URLSearchParams({ client_id: credentials.clientId, redirect_uri: credentials.callbackUrl, response_type: "code", scope: providerScopes.google.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, code_challenge: await challenge(verifier), code_challenge_method: "S256" }).toString()
  } else if (provider === "microsoft") {
    const tenant = Deno.env.get("MICROSOFT_CALENDAR_TENANT_ID")?.trim() || "common"
    authorise = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`)
    authorise.search = new URLSearchParams({ client_id: credentials.clientId, redirect_uri: credentials.callbackUrl, response_type: "code", response_mode: "query", scope: providerScopes.microsoft.join(" "), state, code_challenge: await challenge(verifier), code_challenge_method: "S256" }).toString()
  } else {
    authorise = new URL("https://zoom.us/oauth/authorize")
    authorise.search = new URLSearchParams({ client_id: credentials.clientId, redirect_uri: credentials.callbackUrl, response_type: "code", state, code_challenge: await challenge(verifier), code_challenge_method: "S256" }).toString()
  }
  return json(request, { authorizationUrl: authorise.toString() })
}

async function exchange(provider: Provider, code: string, verifier: string) {
  const credentials = config(provider)
  let endpoint: string
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" }
  const parameters: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: credentials.callbackUrl, code_verifier: verifier }
  if (provider === "google") {
    endpoint = "https://oauth2.googleapis.com/token"
    parameters.client_id = credentials.clientId
    parameters.client_secret = credentials.clientSecret
  } else if (provider === "microsoft") {
    const tenant = Deno.env.get("MICROSOFT_CALENDAR_TENANT_ID")?.trim() || "common"
    endpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
    parameters.client_id = credentials.clientId
    parameters.client_secret = credentials.clientSecret
    parameters.scope = providerScopes.microsoft.join(" ")
  } else {
    endpoint = "https://zoom.us/oauth/token"
    headers.Authorization = `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`
  }
  const result = await fetch(endpoint, { method: "POST", headers, body: new URLSearchParams(parameters) })
  const payload = await result.json().catch(() => ({})) as JsonObject
  if (!result.ok) {
    const providerCode = cleanText(payload.error, 120).toLowerCase()
    const reason = providerCode === "invalid_client" || providerCode === "unauthorized_client"
      ? "credentials_rejected"
      : providerCode === "invalid_grant"
        ? "authorization_rejected"
        : providerCode === "consent_required" || providerCode === "interaction_required"
          ? "permission_denied"
          : "provider_exchange_failed"
    throw new ProviderOAuthError(reason, "The provider did not accept this connection attempt.")
  }
  const accessToken = cleanText(payload.access_token, 8_000)
  const refreshToken = cleanText(payload.refresh_token, 8_000)
  if (!accessToken || !refreshToken) throw new ProviderOAuthError("renewable_token_missing", "The provider did not return a renewable calendar connection.")
  return {
    accessToken, refreshToken,
    expiresAt: new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString(),
    scope: cleanText(payload.scope, 8_000), tokenType: cleanText(payload.token_type, 80) || "Bearer",
  }
}

async function identity(provider: Provider, accessToken: string) {
  const endpoint = provider === "google" ? "https://openidconnect.googleapis.com/v1/userinfo"
    : provider === "microsoft" ? "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName"
    : "https://api.zoom.us/v2/users/me"
  const result = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!result.ok) throw new ProviderOAuthError("identity_unavailable", "The connected account identity could not be confirmed.")
  const payload = await result.json() as JsonObject
  return provider === "google" ? { id: cleanText(payload.sub, 500), tenantId: null, name: cleanText(payload.name, 240), email: cleanText(payload.email, 320) }
    : provider === "microsoft" ? { id: cleanText(payload.id, 500), tenantId: null, name: cleanText(payload.displayName, 240), email: cleanText(payload.mail ?? payload.userPrincipalName, 320) }
    : { id: cleanText(payload.id, 500), tenantId: cleanText(payload.account_id, 500) || null, name: `${cleanText(payload.first_name, 120)} ${cleanText(payload.last_name, 120)}`.trim(), email: cleanText(payload.email, 320) }
}

async function callback(request: Request, admin: SupabaseClient, provider: Provider) {
  const url = new URL(request.url)
  const stateValue = cleanText(url.searchParams.get("state"), 300)
  const code = cleanText(url.searchParams.get("code"), 4_000)
  const stateHash = stateValue ? await sha256(stateValue) : ""
  const { data: candidate, error: candidateError } = await admin.from("CAL_OAuthStates").select("*").eq("CALOAuthState_StateHash", stateHash).eq("CALOAuthState_ProviderCode", provider).maybeSingle()
  const fallbackOrigin = Deno.env.get("APP_URL")?.trim() || "https://multideck.app"
  if (candidateError) return redirectError(fallbackOrigin, "/settings?tab=integrations", "state_check_failed")
  if (!candidate) return redirectError(fallbackOrigin, "/settings?tab=integrations", "state_invalid")
  const origin = isTrustedMultideckOrigin(candidate.CALOAuthState_ReturnOrigin) ? candidate.CALOAuthState_ReturnOrigin : fallbackOrigin
  const returnPath = candidate.CALOAuthState_ReturnPath || "/settings?tab=integrations"
  if (candidate.CALOAuthState_ConsumedAt || Date.parse(candidate.CALOAuthState_ExpiresAt) <= Date.now()) {
    await deleteSecret(admin, candidate.CALOAuthState_PKCESecretRef)
    return redirectError(origin, returnPath, "state_expired")
  }
  if (url.searchParams.get("error") || !code) {
    const { error: consumeError } = await admin.from("CAL_OAuthStates").update({ CALOAuthState_ConsumedAt: new Date().toISOString() }).eq("CALOAuthState_ID", candidate.CALOAuthState_ID).is("CALOAuthState_ConsumedAt", null)
    if (consumeError) console.error("Denied Calendar OAuth state could not be consumed", { stateId: candidate.CALOAuthState_ID })
    await deleteSecret(admin, candidate.CALOAuthState_PKCESecretRef)
    return redirectError(origin, returnPath, "provider_denied")
  }
  if (!(await permissionValues(admin, candidate.CALOAuthState_UserID)).includes("Calendar.Connect")) {
    const { error: consumeError } = await admin.from("CAL_OAuthStates").update({ CALOAuthState_ConsumedAt: new Date().toISOString() }).eq("CALOAuthState_ID", candidate.CALOAuthState_ID).is("CALOAuthState_ConsumedAt", null)
    if (consumeError) console.error("Unauthorised Calendar OAuth state could not be consumed", { stateId: candidate.CALOAuthState_ID })
    await deleteSecret(admin, candidate.CALOAuthState_PKCESecretRef)
    return redirectError(origin, returnPath, "permission_denied")
  }
  const consumedAt = new Date().toISOString()
  const { data: state, error: claimError } = await admin.from("CAL_OAuthStates")
    .update({ CALOAuthState_ConsumedAt: consumedAt })
    .eq("CALOAuthState_ID", candidate.CALOAuthState_ID)
    .is("CALOAuthState_ConsumedAt", null)
    .gt("CALOAuthState_ExpiresAt", consumedAt)
    .select("*").maybeSingle()
  if (claimError || !state) return redirectError(origin, returnPath, "state_expired")
  let tokenRef = ""
  try {
    const verifier = await getSecret(admin, state.CALOAuthState_PKCESecretRef)
    const tokens = await exchange(provider, code, verifier)
    const profile = await identity(provider, tokens.accessToken)
    if (!profile.id || !profile.email) throw new HttpError(400, "The connected provider account is incomplete.")
    tokenRef = await putSecret(admin, `calendar-token-${provider}-${state.CALOAuthState_UserID}`, JSON.stringify(tokens))
    const [{ data: existing, error: existingError }, { data: primary, error: primaryError }] = await Promise.all([
      admin.from("CAL_ProviderConnections").select("CALConnection_ID,CALConnection_IsPrimaryCalendar,CALConnection_ColourCode,CALConnection_SecretRef,CALConnection_SubscriptionSecretRef")
        .eq("CALConnection_UserID", state.CALOAuthState_UserID).eq("CALConnection_ProviderCode", provider).maybeSingle(),
      provider === "zoom"
        ? Promise.resolve({ data: null, error: null })
        : admin.from("CAL_ProviderConnections").select("CALConnection_ID")
          .eq("CALConnection_UserID", state.CALOAuthState_UserID).eq("CALConnection_IsPrimaryCalendar", true)
          .neq("CALConnection_StatusCode", "disconnected").maybeSingle(),
    ])
    if (existingError || primaryError) throw new HttpError(503, "The existing calendar connections could not be checked safely.")
    const defaultColour = provider === "google" ? "blue" : provider === "microsoft" ? "violet" : "neutral"
    const connection = {
      CALConnection_CompanyID: state.CALOAuthState_CompanyID,
      CALConnection_UserID: state.CALOAuthState_UserID,
      CALConnection_ProviderCode: provider,
      CALConnection_IsPrimaryCalendar: provider !== "zoom" && (existing?.CALConnection_IsPrimaryCalendar === true || !primary),
      CALConnection_ColourCode: existing?.CALConnection_ColourCode || defaultColour,
      CALConnection_StatusCode: "syncing",
      CALConnection_ProviderAccountID: profile.id,
      CALConnection_ProviderTenantID: profile.tenantId,
      CALConnection_DisplayName: profile.name,
      CALConnection_Email: profile.email,
      CALConnection_CalendarID: provider === "google" ? "primary" : provider === "microsoft" ? profile.id : null,
      CALConnection_SecretRef: tokenRef,
      CALConnection_ScopesJSON: providerScopes[provider],
      CALConnection_SyncCursor: null,
      CALConnection_LastSyncedAt: null,
      CALConnection_SubscriptionID: null,
      CALConnection_SubscriptionResourceID: null,
      CALConnection_SubscriptionSecretRef: null,
      CALConnection_SubscriptionExpiresAt: null,
      CALConnection_LastError: null,
      CALConnection_UpdatedAt: new Date().toISOString(),
    }
    const result = existing
      ? await admin.from("CAL_ProviderConnections").update(connection).eq("CALConnection_ID", existing.CALConnection_ID).select("CALConnection_ID").single()
      : await admin.from("CAL_ProviderConnections").insert(connection).select("CALConnection_ID").single()
    if (result.error) throw new HttpError(result.error.code === "23505" ? 409 : 500, result.error.code === "23505" ? "This calendar provider is already connected." : "The calendar connection could not be saved.")
    if (existing) {
      const { error: purgeError } = await admin.from("CAL_ProviderEvents").delete().eq("CALProviderEvent_ConnectionID", existing.CALConnection_ID)
      if (purgeError) {
        const { error: attentionError } = await admin.from("CAL_ProviderConnections").update({ CALConnection_StatusCode: "attention", CALConnection_LastError: "The previous calendar cache could not be cleared safely. Reconnect before using booking links." }).eq("CALConnection_ID", existing.CALConnection_ID)
        if (attentionError) console.error("Calendar reconnect cleanup state could not be recorded", { connectionId: existing.CALConnection_ID })
        await deleteSecret(admin, existing.CALConnection_SecretRef)
        await deleteSecret(admin, existing.CALConnection_SubscriptionSecretRef)
        await deleteSecret(admin, state.CALOAuthState_PKCESecretRef)
        return redirectError(origin, returnPath, "connection_cleanup_failed")
      }
    }
    if (existing?.CALConnection_SecretRef && existing.CALConnection_SecretRef !== tokenRef) await deleteSecret(admin, existing.CALConnection_SecretRef)
    if (existing?.CALConnection_SubscriptionSecretRef) await deleteSecret(admin, existing.CALConnection_SubscriptionSecretRef)
    await deleteSecret(admin, state.CALOAuthState_PKCESecretRef)
    const success = new URL(returnPath, origin)
    success.searchParams.set("calendar_connection", "syncing")
    success.searchParams.set("provider", provider)
    return Response.redirect(success.toString(), 303)
  } catch (error) {
    if (tokenRef) await deleteSecret(admin, tokenRef)
    await deleteSecret(admin, state.CALOAuthState_PKCESecretRef)
    console.error(error)
    return redirectError(origin, returnPath,
      error instanceof ProviderOAuthError ? error.reason
        : error instanceof HttpError && error.status === 409 ? "connection_conflict"
          : "connection_failed")
  }
}

async function disconnect(request: Request, admin: SupabaseClient, provider: Provider) {
  const { user } = await authenticate(request, admin)
  const actor = await currentInternalUser(admin, user)
  if (!(await permissionValues(admin, actor.User_ID)).includes("Calendar.Connect")) throw new HttpError(403, "You do not have permission to disconnect a personal calendar.")
  const { data: connection, error: connectionError } = await admin.from("CAL_ProviderConnections").select("*").eq("CALConnection_CompanyID", actor.Company_ID).eq("CALConnection_UserID", actor.User_ID).eq("CALConnection_ProviderCode", provider).maybeSingle()
  if (connectionError) throw new HttpError(503, "The calendar connection could not be checked safely.")
  if (!connection) return json(request, { disconnected: true })
  const { count, error: meetingsError } = await admin.from("CAL_Meetings").select("CALMeeting_ID", { count: "exact", head: true })
    .eq("CALMeeting_OrganiserUserID", actor.User_ID).eq("CALMeeting_ProviderCode", provider === "google" ? "google_meet" : provider === "microsoft" ? "microsoft_teams" : "zoom")
    .in("CALMeeting_StatusCode", ["provisioning", "confirmed", "sync_pending"])
    .gte("CALMeeting_EndAt", new Date().toISOString())
  if (meetingsError) throw new HttpError(503, "Upcoming meetings could not be checked before disconnecting.")
  if (count) throw new HttpError(409, `Move or cancel ${count} upcoming ${provider === "microsoft" ? "Teams" : provider === "google" ? "Meet" : "Zoom"} meeting${count === 1 ? "" : "s"} before disconnecting.`)
  try {
    const bundle = JSON.parse(await getSecret(admin, connection.CALConnection_SecretRef)) as { accessToken?: string }
    if (bundle.accessToken && provider === "google" && connection.CALConnection_SubscriptionID && connection.CALConnection_SubscriptionResourceID) {
      await fetch("https://www.googleapis.com/calendar/v3/channels/stop", { method: "POST", headers: { Authorization: `Bearer ${bundle.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: connection.CALConnection_SubscriptionID, resourceId: connection.CALConnection_SubscriptionResourceID }) })
    }
    if (bundle.accessToken && provider === "microsoft" && connection.CALConnection_SubscriptionID) {
      await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(connection.CALConnection_SubscriptionID)}`, { method: "DELETE", headers: { Authorization: `Bearer ${bundle.accessToken}` } })
    }
  } catch { /* Provider subscriptions expire naturally; local credentials are still revoked below. */ }
  const { error: disconnectError } = await admin.from("CAL_ProviderConnections").update({ CALConnection_StatusCode: "disconnected", CALConnection_IsPrimaryCalendar: false, CALConnection_SubscriptionID: null, CALConnection_SubscriptionResourceID: null, CALConnection_SubscriptionSecretRef: null, CALConnection_SubscriptionExpiresAt: null, CALConnection_UpdatedAt: new Date().toISOString() }).eq("CALConnection_ID", connection.CALConnection_ID)
  if (disconnectError) throw new HttpError(503, "The calendar connection could not be disconnected safely.")
  await deleteSecret(admin, connection.CALConnection_SecretRef)
  await deleteSecret(admin, connection.CALConnection_SubscriptionSecretRef)
  return json(request, { disconnected: true })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return json(request, {}, 204)
  try {
    const admin = adminClient()
    const path = routeParts(request, "calendar-oauth")
    const provider = providerValue(path[1])
    if (path[0] === "start" && request.method === "GET") return await start(request, admin, provider)
    if (path[0] === "callback" && request.method === "GET") return await callback(request, admin, provider)
    if (path[0] === "disconnect" && request.method === "POST") return await disconnect(request, admin, provider)
    throw new HttpError(404, "Calendar connection route not found.")
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const detail = error instanceof Error ? error.message : "The calendar connection could not be completed."
    console.error(error)
    return json(request, { detail }, status)
  }
})
