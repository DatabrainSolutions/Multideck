import {
  canonicalNotification,
  constantTimeEqual,
  decodePubSubData,
  microsoftDedupeKey,
  resourceMatches,
} from "./core.ts"

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test("Gmail Pub/Sub data is decoded without message bodies", () => {
  const encoded = btoa(JSON.stringify({ emailAddress: "ops@example.com", historyId: "12345" }))
  const payload = decodePubSubData(encoded)
  assert(payload.emailAddress === "ops@example.com")
  assert(payload.historyId === "12345")
})

Deno.test("Graph resources stay inside their configured subscription", () => {
  assert(resourceMatches("users/abc/messages", "/users/abc/messages/message-1"))
  assert(!resourceMatches("users/abc/messages", "/users/other/messages/message-1"))
  assert(!resourceMatches("users/abc/messages", "/users/abc/mailFolders/inbox"))
})

Deno.test("client state comparison and event dedupe are stable", async () => {
  assert(await constantTimeEqual("secret-client-state", "secret-client-state"))
  assert(!await constantTimeEqual("secret-client-state", "wrong-client-state"))
  const notification = {
    subscriptionId: "subscription-1",
    changeType: "updated",
    resource: "users/abc/messages/message-1",
    clientState: "must-not-be-persisted",
    resourceData: { id: "message-1" },
  }
  const first = await microsoftDedupeKey(notification)
  const second = await microsoftDedupeKey({ ...notification, clientState: "different-delivery-secret" })
  assert(first === second)
  assert(!canonicalNotification(notification).includes("must-not-be-persisted"))
})
