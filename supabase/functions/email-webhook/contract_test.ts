function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message)
}

const indexSource = await Deno.readTextFile(new URL("./index.ts", import.meta.url))
const coreSource = await Deno.readTextFile(new URL("./core.ts", import.meta.url))
const configSource = await Deno.readTextFile(new URL("../../config.toml", import.meta.url))

Deno.test("provider webhooks use provider-specific verification with no gateway JWT assumption", () => {
  assert(configSource.includes("[functions.email-webhook]\nverify_jwt = false"))
  assert(indexSource.includes("verifyGooglePushJwt"))
  assert(indexSource.includes("GMAIL_PUBSUB_PUSH_AUDIENCE"))
  assert(indexSource.includes("GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT"))
  assert(indexSource.includes("validationToken"))
  assert(indexSource.includes("constantTimeEqual(clientState, expectedClientState)"))
})

Deno.test("notifications resolve a live subscription and enqueue only normalized metadata", () => {
  assert(indexSource.includes("comm_resolve_email_provider_subscription"))
  assert(indexSource.includes("comm_enqueue_email_inbound_event"))
  assert(indexSource.includes("CommConn_ProviderTypeCode"))
  assert(indexSource.includes("CommMailbox_ConnectionID"))
  assert(!indexSource.includes("clientState:"))
  assert(!indexSource.includes("encryptedContent:"))
  assert(!indexSource.includes("console."))
  assert(coreSource.includes('key === "clientState" || key === "encryptedContent"'))
})
