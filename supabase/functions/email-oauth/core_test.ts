import {
  assertAllowedOrigin,
  assertSafeReturnPath,
  buildAuthorizationUrl,
  createPkce,
  createSignedState,
  failureRedirect,
  providerAuthorizationErrorCode,
  providerScopes,
  publicOAuthErrorCode,
  readAllowedOrigins,
  requestedScopes,
  verifySignedState,
} from "./core.ts"

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message)
}

async function rejects(callback: () => unknown | Promise<unknown>, code: string) {
  try {
    await callback()
  } catch (error) {
    assert(error instanceof Error && error.message === code, `Expected ${code}`)
    return
  }
  throw new Error(`Expected rejection: ${code}`)
}

Deno.test("redirect origins are exact allowlist entries", async () => {
  const origins = readAllowedOrigins({
    EMAIL_ALLOWED_REDIRECT_ORIGINS: "https://jenkar.multideck.app,http://localhost:3000,https://bad.example/path",
  })
  assert(origins.has("https://jenkar.multideck.app"))
  assert(origins.has("http://localhost:3000"))
  assert(!origins.has("https://bad.example"))
  assert(assertAllowedOrigin("https://jenkar.multideck.app", origins) === "https://jenkar.multideck.app")
  await rejects(() => assertAllowedOrigin("https://attacker.example", origins), "redirect_origin_not_allowed")
})

Deno.test("return paths cannot escape the tenant origin", async () => {
  assert(assertSafeReturnPath("/inbox?connected=true") === "/inbox?connected=true")
  await rejects(() => assertSafeReturnPath("//attacker.example/inbox"), "return_path_not_allowed")
  await rejects(() => assertSafeReturnPath("https://attacker.example"), "return_path_not_allowed")
})

Deno.test("browser callback failures use only fixed public error codes", () => {
  assert(publicOAuthErrorCode("provider_token_exchange_failed") === "provider_token_exchange_failed")
  assert(publicOAuthErrorCode("database said something sensitive") === "service_unavailable")
  const redirect = new URL(failureRedirect(
    "https://jenkar.multideck.app",
    "/inbox",
    "gmail",
    "arbitrary provider detail",
  ))
  assert(redirect.searchParams.get("code") === "service_unavailable")
})

Deno.test("OAuth state is signed, expiring, provider-bound, and origin-bound", async () => {
  const secret = "a-strong-test-secret-with-at-least-thirty-two-characters"
  const now = Date.UTC(2026, 6, 31, 12, 0, 0)
  const origins = new Set(["https://jenkar.multideck.app"])
  const state = await createSignedState("gmail", "https://jenkar.multideck.app", secret, now)
  const parsed = await verifySignedState(state, secret, origins, now + 60_000)
  assert(parsed.provider === "gmail")
  assert(parsed.returnOrigin === "https://jenkar.multideck.app")
  await rejects(
    () => verifySignedState(`${state.slice(0, -1)}x`, secret, origins, now + 60_000),
    "oauth_state_invalid",
  )
  await rejects(() => verifySignedState(state, secret, origins, now + 11 * 60_000), "oauth_state_expired")
})

Deno.test("provider URL carries only the PKCE challenge and requested mailbox scopes", async () => {
  const pkce = await createPkce()
  const url = new URL(buildAuthorizationUrl({
    provider: "gmail",
    clientId: "gmail-client",
    clientSecret: "server-only",
    callbackUrl: "https://project.supabase.co/functions/v1/email-oauth",
  }, "signed-state", pkce.challenge))
  assert(url.searchParams.get("code_challenge") === pkce.challenge)
  assert(!url.toString().includes(pkce.verifier))
  assert(!url.toString().includes("server-only"))
  assert(url.searchParams.get("scope")?.includes("gmail.modify"))
  assert(url.searchParams.get("scope")?.includes("gmail.settings.basic"))
  assert(url.searchParams.get("access_type") === "offline")
  assert(url.searchParams.get("include_granted_scopes") === "false")
})

Deno.test("Outlook uses the tenant callback and elevates shared access explicitly", async () => {
  const callbackUrl = "https://project.supabase.co/functions/v1/email-oauth"
  const config = {
    provider: "outlook" as const,
    clientId: "microsoft-client",
    clientSecret: "server-only",
    callbackUrl,
    tenantId: "tenant-id",
  }
  const pkce = await createPkce()
  const personal = providerScopes("outlook")
  const shared = providerScopes("outlook", "shared")
  const personalUrl = new URL(buildAuthorizationUrl(config, "signed-state", pkce.challenge))
  const sharedUrl = new URL(buildAuthorizationUrl(config, "signed-state", pkce.challenge, "shared"))

  assert(personalUrl.origin === "https://login.microsoftonline.com")
  assert(personalUrl.pathname === "/tenant-id/oauth2/v2.0/authorize")
  assert(personalUrl.searchParams.get("redirect_uri") === callbackUrl)
  assert(personalUrl.searchParams.get("response_type") === "code")
  assert(personalUrl.searchParams.get("response_mode") === "query")
  assert(personalUrl.searchParams.get("code_challenge") === pkce.challenge)
  assert(!personalUrl.toString().includes("server-only"))
  assert(personal.includes("Mail.ReadWrite"))
  assert(personal.includes("Mail.Send"))
  assert(personal.includes("MailboxSettings.ReadWrite"))
  assert(!personal.includes("Mail.ReadWrite.Shared"))
  assert(!personal.includes("Mail.Send.Shared"))
  assert(shared.includes("Mail.ReadWrite.Shared"))
  assert(shared.includes("Mail.Send.Shared"))
  assert(personalUrl.searchParams.get("scope") === personal.join(" "))
  assert(sharedUrl.searchParams.get("scope") === shared.join(" "))
  assert(requestedScopes("outlook", personal).join(" ") === personal.join(" "))
})

Deno.test("stored OAuth scopes fail closed when they are not a known permission set", async () => {
  await rejects(() => requestedScopes("outlook", ["Mail.ReadWrite", "Directory.Read.All"]), "oauth_state_invalid")
})

Deno.test("Microsoft admin-consent failures map to one safe recovery code", () => {
  assert(
    providerAuthorizationErrorCode(
      "outlook",
      "access_denied",
      "AADSTS90094: The grant requires admin permission.",
    ) === "provider_admin_consent_required",
  )
  assert(
    providerAuthorizationErrorCode("outlook", "access_denied", "The user cancelled.") ===
      "provider_authorization_denied",
  )
  assert(
    providerAuthorizationErrorCode(
      "outlook",
      "access_denied",
      "AADSTS65004: User declined to consent to access the app.",
    ) === "provider_authorization_denied",
  )
  assert(
    providerAuthorizationErrorCode("gmail", "access_denied", "admin consent") ===
      "provider_authorization_denied",
  )
})
