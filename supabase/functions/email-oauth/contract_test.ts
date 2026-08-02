function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message)
}

const indexSource = await Deno.readTextFile(new URL("./index.ts", import.meta.url))
const coreSource = await Deno.readTextFile(new URL("./core.ts", import.meta.url))
const configSource = await Deno.readTextFile(new URL("../../config.toml", import.meta.url))

Deno.test("OAuth initiation authenticates the user while the callback remains externally reachable", () => {
  assert(indexSource.includes("userClient.auth.getUser()"))
  assert(indexSource.includes("request.method === \"POST\""))
  assert(indexSource.includes("request.method === \"GET\""))
  assert(configSource.includes("[functions.email-oauth]\nverify_jwt = false"))
})

Deno.test("OAuth state and credentials use one-time database and Vault boundaries", () => {
  assert(indexSource.includes("comm_begin_email_oauth_state"))
  assert(indexSource.includes("comm_consume_email_oauth_state"))
  assert(indexSource.includes("comm_complete_email_oauth_connection"))
  assert(coreSource.includes("comm_put_email_secret"))
  assert(coreSource.includes("comm_get_email_secret"))
  assert(coreSource.includes("comm_delete_email_secret"))
  assert(!indexSource.includes("EMAIL_SECRET_STORE_URL"))
  assert(!indexSource.includes("EMAIL_SECRET_STORE_TOKEN"))
  assert(!indexSource.includes("console."))
})

Deno.test("browser responses expose only an authorization URL and status", () => {
  assert(indexSource.includes("authorizationUrl: buildAuthorizationUrl"))
  assert(!indexSource.includes("return json(request, allowedOrigins, {\n    accessToken"))
  assert(!indexSource.includes("return json(request, allowedOrigins, {\n    refreshToken"))
  assert(indexSource.includes('"Referrer-Policy": "no-referrer"'))
})

Deno.test("consumed PKCE verifiers are deleted on every pre-exchange callback failure", () => {
  const callbackSource = indexSource.slice(indexSource.indexOf("async function completeAuthorization"))
  assert(callbackSource.includes("stateRow.provider_code !== signedState.provider"))
  assert(callbackSource.includes("await deleteSecret(secretRpc, stateRow.pkce_verifier_secret_ref)"))
  assert(callbackSource.includes("providerConfig = readProviderConfig(provider, env)"))
  assert(callbackSource.includes("finally {\n    await deleteSecret(secretRpc, stateRow.pkce_verifier_secret_ref)"))
  assert(coreSource.includes("PUBLIC_OAUTH_ERROR_CODES"))
  assert(coreSource.includes("publicOAuthErrorCode(code)"))
})
