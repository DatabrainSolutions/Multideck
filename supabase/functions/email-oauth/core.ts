export type EmailProvider = "gmail" | "outlook"
export type EmailAccessMode = "personal" | "shared"

export type OAuthStatePayload = {
  v: 1
  p: EmailProvider
  e: number
  n: string
  o: string
}

export type OAuthProviderConfig = {
  provider: EmailProvider
  clientId: string
  clientSecret: string
  callbackUrl: string
  tenantId?: string
}

export type ProviderIdentity = {
  providerAccountId: string
  providerTenantId: string | null
  mailboxAddress: string
  mailboxDisplayName: string
  providerMailboxId: string
}

export type TokenExchange = {
  accessToken: string
  refreshToken: string
  tokenType: string
  scope: string
  expiresAt: string
  providerTenantId: string | null
}

export type SecretRpc = (
  functionName: string,
  parameters: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>

const PUBLIC_OAUTH_ERROR_CODES = new Set([
  "authentication_required",
  "request_invalid",
  "redirect_origin_not_allowed",
  "return_path_not_allowed",
  "provider_not_configured",
  "oauth_configuration_missing",
  "secret_store_unavailable",
  "workspace_profile_missing",
  "email_connect_denied",
  "oauth_state_invalid",
  "oauth_state_expired",
  "oauth_provider_mismatch",
  "provider_authorization_denied",
  "provider_admin_consent_required",
  "provider_token_exchange_failed",
  "provider_refresh_token_missing",
  "provider_identity_lookup_failed",
  "connection_save_failed",
  "service_unavailable",
])

export function publicOAuthErrorCode(value: unknown) {
  const candidate = cleanString(value, 80)
  return PUBLIC_OAUTH_ERROR_CODES.has(candidate) ? candidate : "service_unavailable"
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function base64UrlJson(value: unknown) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)))
}

function parseBase64UrlJson(value: string): unknown {
  return JSON.parse(decoder.decode(base64UrlToBytes(value)))
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function cleanString(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

export function isEmailProvider(value: unknown): value is EmailProvider {
  return value === "gmail" || value === "outlook"
}

export function isEmailAccessMode(value: unknown): value is EmailAccessMode {
  return value === "personal" || value === "shared"
}

export function readAllowedOrigins(environment: Record<string, string | undefined>) {
  const candidates = [
    ...(environment.EMAIL_ALLOWED_REDIRECT_ORIGINS ?? "").split(","),
    environment.EMAIL_CANONICAL_APP_ORIGIN ?? "",
    environment.APP_URL ?? "",
  ]

  return new Set(candidates.flatMap((candidate) => {
    const trimmed = candidate.trim()
    if (!trimmed) return []
    try {
      const url = new URL(trimmed)
      if (url.origin !== trimmed || (url.protocol !== "https:" && !isLocalDevelopmentUrl(url))) return []
      return [url.origin]
    } catch {
      return []
    }
  }))
}

export function assertAllowedOrigin(value: unknown, allowedOrigins: Set<string>) {
  const candidate = cleanString(value, 500)
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error("redirect_origin_not_allowed")
  }

  if (url.origin !== candidate || !allowedOrigins.has(url.origin)) {
    throw new Error("redirect_origin_not_allowed")
  }
  return url.origin
}

export function assertSafeReturnPath(value: unknown) {
  const candidate = cleanString(value, 500) || "/inbox"
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    throw new Error("return_path_not_allowed")
  }

  let url: URL
  try {
    url = new URL(candidate, "https://return-path.invalid")
  } catch {
    throw new Error("return_path_not_allowed")
  }
  if (url.origin !== "https://return-path.invalid") throw new Error("return_path_not_allowed")
  return `${url.pathname}${url.search}${url.hash}`
}

export function assertCallbackUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("oauth_configuration_missing")
  }
  if (url.protocol !== "https:" && !isLocalDevelopmentUrl(url)) {
    throw new Error("oauth_configuration_missing")
  }
  if (url.username || url.password || url.hash) throw new Error("oauth_configuration_missing")
  return url.toString()
}

function isLocalDevelopmentUrl(url: URL) {
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
}

function assertStrongSecret(value: string, code: string) {
  if (value.trim().length < 32) throw new Error(code)
  return value.trim()
}

export function readSigningSecret(value: string | undefined) {
  return assertStrongSecret(value ?? "", "oauth_configuration_missing")
}

export function readProviderConfig(
  provider: EmailProvider,
  environment: Record<string, string | undefined>,
): OAuthProviderConfig {
  const callbackUrl = assertCallbackUrl(cleanString(environment.EMAIL_OAUTH_CALLBACK_URL, 1000))
  if (provider === "gmail") {
    const clientId = cleanString(environment.GMAIL_CLIENT_ID, 500)
    const clientSecret = cleanString(environment.GMAIL_CLIENT_SECRET, 1000)
    if (!clientId || !clientSecret) throw new Error("provider_not_configured")
    return { provider, clientId, clientSecret, callbackUrl }
  }

  const clientId = cleanString(environment.MICROSOFT_CLIENT_ID, 500)
  const clientSecret = cleanString(environment.MICROSOFT_CLIENT_SECRET, 1000)
  const tenantId = cleanString(environment.MICROSOFT_TENANT_ID, 180)
  if (!clientId || !clientSecret || !tenantId || !/^[a-zA-Z0-9.-]+$/.test(tenantId)) {
    throw new Error("provider_not_configured")
  }
  return { provider, clientId, clientSecret, callbackUrl, tenantId }
}

async function importHmacKey(secret: string) {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

export async function createSignedState(
  provider: EmailProvider,
  returnOrigin: string,
  signingSecret: string,
  now = Date.now(),
) {
  const nonce = crypto.getRandomValues(new Uint8Array(32))
  const payload: OAuthStatePayload = {
    v: 1,
    p: provider,
    e: Math.floor(now / 1000) + 10 * 60,
    n: bytesToBase64Url(nonce),
    o: returnOrigin,
  }
  const encodedPayload = base64UrlJson(payload)
  const signature = await crypto.subtle.sign("HMAC", await importHmacKey(signingSecret), encoder.encode(encodedPayload))
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`
}

export async function verifySignedState(
  state: string,
  signingSecret: string,
  allowedOrigins: Set<string>,
  now = Date.now(),
) {
  const [encodedPayload, encodedSignature, extra] = state.split(".")
  if (!encodedPayload || !encodedSignature || extra) throw new Error("oauth_state_invalid")

  let signature: Uint8Array
  try {
    signature = base64UrlToBytes(encodedSignature)
  } catch {
    throw new Error("oauth_state_invalid")
  }
  // Reject alternate/non-canonical Base64URL spellings of the same bytes. This
  // makes any textual change to the signed state fail closed, including changes
  // confined to unused padding bits in the final character.
  if (bytesToBase64Url(signature) !== encodedSignature) {
    throw new Error("oauth_state_invalid")
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await importHmacKey(signingSecret),
    Uint8Array.from(signature),
    encoder.encode(encodedPayload),
  )
  if (!valid) throw new Error("oauth_state_invalid")

  let payload: unknown
  try {
    payload = parseBase64UrlJson(encodedPayload)
  } catch {
    throw new Error("oauth_state_invalid")
  }
  if (!isPlainObject(payload) || payload.v !== 1 || !isEmailProvider(payload.p)) {
    throw new Error("oauth_state_invalid")
  }

  const expiry = Number(payload.e)
  const nonce = cleanString(payload.n, 100)
  const origin = assertAllowedOrigin(payload.o, allowedOrigins)
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(now / 1000) || nonce.length < 32) {
    throw new Error("oauth_state_expired")
  }
  return { provider: payload.p, expiresAt: expiry, returnOrigin: origin }
}

export async function sha256(value: string) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))))
}

export async function createPkce() {
  const verifier = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(64)))
  const challenge = await sha256(verifier)
  return { verifier, challenge }
}

export function providerScopes(provider: EmailProvider, accessMode: EmailAccessMode = "personal") {
  if (provider === "gmail") {
    return [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.settings.basic",
    ]
  }

  const scopes = [
    "offline_access",
    "openid",
    "profile",
    "email",
    "User.Read",
    "Mail.ReadWrite",
    "Mail.Send",
    "MailboxSettings.ReadWrite",
  ]
  if (accessMode === "shared") {
    scopes.push(
      "Mail.ReadWrite.Shared",
      "Mail.Send.Shared",
    )
  }
  return scopes
}

export function requestedScopes(provider: EmailProvider, value: unknown) {
  if (!Array.isArray(value) || value.some((scope) => typeof scope !== "string")) {
    throw new Error("oauth_state_invalid")
  }

  const actual = [...new Set(value)].sort()
  const candidates = provider === "outlook"
    ? [providerScopes(provider, "personal"), providerScopes(provider, "shared")]
    : [providerScopes(provider)]
  const match = candidates.find((candidate) => {
    const expected = [...candidate].sort()
    return expected.length === actual.length && expected.every((scope, index) => scope === actual[index])
  })
  if (!match) throw new Error("oauth_state_invalid")
  return match
}

export function providerAuthorizationErrorCode(
  provider: EmailProvider,
  providerError: unknown,
  providerErrorDescription: unknown,
) {
  if (provider !== "outlook") return "provider_authorization_denied"
  const error = cleanString(providerError, 120).toLowerCase()
  const description = cleanString(providerErrorDescription, 500).toLowerCase()
  const needsAdmin = ["aadsts65001", "aadsts90094"].some((code) => description.includes(code))
    || description.includes("admin approval")
    || description.includes("administrator approval")
    || description.includes("admin consent")
    || description.includes("only an admin can grant")
  return needsAdmin && (error === "access_denied" || error === "consent_required" || error === "interaction_required")
    ? "provider_admin_consent_required"
    : "provider_authorization_denied"
}

export function buildAuthorizationUrl(
  config: OAuthProviderConfig,
  state: string,
  codeChallenge: string,
  accessMode: EmailAccessMode = "personal",
) {
  const scopes = providerScopes(config.provider, accessMode)
  const url = config.provider === "gmail"
    ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
    : new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId!)}/oauth2/v2.0/authorize`)
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.callbackUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", scopes.join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  if (config.provider === "gmail") {
    url.searchParams.set("access_type", "offline")
    // Keep Inbox least-privileged even when this Google OAuth client has older
    // grants for another Multideck/Bryx workflow. Incremental authorization
    // would bundle those unrelated scopes (for example Drive) into this token.
    url.searchParams.set("include_granted_scopes", "false")
    url.searchParams.set("prompt", "consent")
  } else {
    url.searchParams.set("response_mode", "query")
    url.searchParams.set("prompt", "select_account")
  }
  return url.toString()
}

async function fetchWithTimeout(url: string, init: RequestInit, milliseconds = 12_000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), milliseconds)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function exchangeAuthorizationCode(
  config: OAuthProviderConfig,
  code: string,
  codeVerifier: string,
  scopes: string[] = providerScopes(config.provider),
): Promise<TokenExchange> {
  const endpoint = config.provider === "gmail"
    ? "https://oauth2.googleapis.com/token"
    : `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId!)}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.callbackUrl,
  })
  if (config.provider === "outlook") body.set("scope", scopes.join(" "))

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  let result: unknown
  try {
    result = await response.json()
  } catch {
    result = null
  }
  if (!response.ok || !isPlainObject(result)) throw new Error("provider_token_exchange_failed")

  const accessToken = cleanString(result.access_token, 16_000)
  const refreshToken = cleanString(result.refresh_token, 16_000)
  const tokenType = cleanString(result.token_type, 80) || "Bearer"
  const scope = cleanString(result.scope, 4_000)
  const idTokenClaims = decodeJwtPayload(cleanString(result.id_token, 32_000))
  const providerTenantId = config.provider === "outlook"
    ? cleanString(idTokenClaims?.tid, 180) || null
    : null
  const expiresIn = Math.max(60, Math.min(Number(result.expires_in) || 3600, 86_400))
  if (!accessToken || !refreshToken) throw new Error("provider_refresh_token_missing")
  return {
    accessToken,
    refreshToken,
    tokenType,
    scope,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    providerTenantId,
  }
}

function decodeJwtPayload(jwt: string) {
  const payload = jwt.split(".")[1]
  if (!payload) return null
  try {
    const parsed = parseBase64UrlJson(payload)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function fetchProviderIdentity(
  config: OAuthProviderConfig,
  token: TokenExchange,
): Promise<ProviderIdentity> {
  if (config.provider === "gmail") {
    const [identityResponse, mailboxResponse] = await Promise.all([
      fetchWithTimeout("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
      }),
      fetchWithTimeout("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `${token.tokenType} ${token.accessToken}` },
      }),
    ])
    const identity = await identityResponse.json().catch(() => null)
    const mailbox = await mailboxResponse.json().catch(() => null)
    if (!identityResponse.ok || !mailboxResponse.ok || !isPlainObject(identity) || !isPlainObject(mailbox)) {
      throw new Error("provider_identity_lookup_failed")
    }
    const accountId = cleanString(identity.sub, 180)
    const address = cleanString(mailbox.emailAddress ?? identity.email, 320).toLowerCase()
    const displayName = cleanString(identity.name, 180) || address
    if (!accountId || !isEmailAddress(address)) throw new Error("provider_identity_lookup_failed")
    return {
      providerAccountId: accountId,
      providerTenantId: null,
      mailboxAddress: address,
      mailboxDisplayName: displayName,
      providerMailboxId: address,
    }
  }

  const response = await fetchWithTimeout(
    "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
    { headers: { Authorization: `${token.tokenType} ${token.accessToken}` } },
  )
  const identity = await response.json().catch(() => null)
  if (!response.ok || !isPlainObject(identity)) throw new Error("provider_identity_lookup_failed")
  const accountId = cleanString(identity.id, 180)
  const address = cleanString(identity.mail ?? identity.userPrincipalName, 320).toLowerCase()
  const displayName = cleanString(identity.displayName, 180) || address
  if (!accountId || !isEmailAddress(address)) throw new Error("provider_identity_lookup_failed")
  return {
    providerAccountId: accountId,
    providerTenantId: token.providerTenantId,
    mailboxAddress: address,
    mailboxDisplayName: displayName,
    providerMailboxId: accountId,
  }
}

function isEmailAddress(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function putSecret(
  rpc: SecretRpc,
  namespace: "email-oauth-pkce" | "email-provider-token",
  secret: string,
) {
  const { data, error } = await rpc("comm_put_email_secret", {
    p_secret: secret,
    p_name: `${namespace}:${crypto.randomUUID()}`,
    p_description: namespace === "email-oauth-pkce"
      ? "Short-lived PKCE verifier for a Multideck email connection."
      : "Refresh and access token bundle for a Multideck email provider connection.",
  })
  const secretRef = cleanString(Array.isArray(data) ? data[0] : data, 240)
  if (error || !/^supabase-vault:[0-9a-f-]{36}$/i.test(secretRef)) {
    throw new Error("secret_store_unavailable")
  }
  return secretRef
}

export async function getSecret(rpc: SecretRpc, secretRef: string) {
  const { data, error } = await rpc("comm_get_email_secret", { p_secret_ref: secretRef })
  const secret = cleanString(Array.isArray(data) ? data[0] : data, 32_000)
  if (error || !secret) throw new Error("secret_store_unavailable")
  return secret
}

export async function deleteSecret(rpc: SecretRpc, secretRef: string) {
  const { data, error } = await rpc("comm_delete_email_secret", { p_secret_ref: secretRef })
  if (error || data !== true) throw new Error("secret_store_unavailable")
}

export function successRedirect(origin: string, returnPath: string, provider: EmailProvider) {
  const target = new URL(assertSafeReturnPath(returnPath), origin)
  target.searchParams.set("email_connection", provider)
  target.searchParams.set("status", "connected")
  return target.toString()
}

export function failureRedirect(origin: string, returnPath: string, provider: EmailProvider, code: string) {
  const target = new URL(assertSafeReturnPath(returnPath), origin)
  target.searchParams.set("email_connection", provider)
  target.searchParams.set("status", "error")
  target.searchParams.set("code", publicOAuthErrorCode(code))
  return target.toString()
}
