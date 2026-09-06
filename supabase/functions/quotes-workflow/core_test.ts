import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14"
import { buildQuoteResponseUrl, buildSimpleQuoteEmailDraft, parseAction, parseDeliveryMode, parseExpiryPreset, parseLifecycleAction, parseReference, validateSavePayload } from "./core.ts"

Deno.test("accepts the explicit quote workflow actions", () => {
  assertEquals(parseAction("save"), "save")
  assertEquals(parseAction("readiness"), "readiness")
  assertEquals(parseAction("issue-options"), "issue-options")
  assertEquals(parseAction("issue-draft"), "issue-draft")
  assertEquals(parseAction("issue-preview"), "issue-preview")
  assertEquals(parseAction("issue"), "issue")
  assertEquals(parseAction("follow-up-settings"), "follow-up-settings")
  assertEquals(parseAction("save-follow-up-settings"), "save-follow-up-settings")
  assertEquals(parseLifecycleAction("accepted"), "accepted")
})

Deno.test("accepts only the quote link expiry presets shown to operators", () => {
  assertEquals(parseExpiryPreset(7), 7)
  assertEquals(parseExpiryPreset("28"), 28)
  assertEquals(parseExpiryPreset("never"), "never")
  assertThrows(() => parseExpiryPreset(30))
  assertThrows(() => parseExpiryPreset(91))
})

Deno.test("accepts only the two quote delivery modes", () => {
  assertEquals(parseDeliveryMode(undefined), "standard")
  assertEquals(parseDeliveryMode("standard"), "standard")
  assertEquals(parseDeliveryMode("simple"), "simple")
  assertThrows(() => parseDeliveryMode("branded"))
})

Deno.test("builds a concise deterministic Simple quote email", () => {
  assertEquals(buildSimpleQuoteEmailDraft({
    reference: "Q-1042",
    origin: "Felixstowe",
    destination: "Rotterdam",
    totalLabel: "£1,250.00",
    recipientFirstName: "Alex",
    senderFirstName: "Harry",
  }), {
    subject: "Quote Q-1042 – Felixstowe to Rotterdam",
    bodyText: "Hi Alex, our quote for Felixstowe to Rotterdam is £1,250.00. I’ve attached the full quote for your reference. Thank you, Harry",
  })
  assertEquals(buildSimpleQuoteEmailDraft({ reference: "Q-1042", totalLabel: "shown in the attached quote" }), {
    subject: "Quote Q-1042",
    bodyText: "Hello, our quote for quote Q-1042 is shown in the attached quote. I’ve attached the full quote for your reference. Thank you",
  })
})

Deno.test("rejects unsupported actions and malformed references", () => {
  assertThrows(() => parseAction("delete"))
  assertThrows(() => parseReference("../Q-22"))
})

Deno.test("builds customer response links on the App origin that issued them", () => {
  assertEquals(buildQuoteResponseUrl("https://dev.multideck.app", "secret-token"), "https://dev.multideck.app/quotes/respond/secret-token")
  assertEquals(buildQuoteResponseUrl("https://jenkar.multideck.app", "secret-token"), "https://jenkar.multideck.app/quotes/respond/secret-token")
  assertEquals(buildQuoteResponseUrl("http://127.0.0.1:3000", "a/b"), "http://127.0.0.1:3000/quotes/respond/a%2Fb")
  assertEquals(buildQuoteResponseUrl("http://localhost:3000", "secret-token"), "http://localhost:3000/quotes/respond/secret-token")
  assertThrows(() => buildQuoteResponseUrl("", "secret-token"))
  assertThrows(() => buildQuoteResponseUrl("https://multideck.app", "secret-token"))
  assertThrows(() => buildQuoteResponseUrl("https://jenkar.multideck.live", "secret-token"))
  assertThrows(() => buildQuoteResponseUrl("https://portal.example.test", "secret-token"))
  assertThrows(() => buildQuoteResponseUrl("https://jenkar.multideck.app:8443", "secret-token"))
  assertThrows(() => buildQuoteResponseUrl("http://jenkar.multideck.app", "secret-token"))
  assertThrows(() => buildQuoteResponseUrl("https://jenkar.multideck.app/another-path", "secret-token"))
  assertThrows(() => buildQuoteResponseUrl("http://localhost:4321", "secret-token"))
})

Deno.test("rejects a blank draft and validates any supplied source", () => {
  assertThrows(() => validateSavePayload({ sourceType: "email", sourceId: crypto.randomUUID() }))
  assertThrows(() => validateSavePayload({ sourceType: "account", sourceId: "", charges: [] }))
  const payload = validateSavePayload({ sourceType: "lead", sourceId: crypto.randomUUID(), customerName: "Acme", charges: [] })
  assertEquals(payload.sourceType, "lead")
})

Deno.test("does not treat generated workspace defaults as quote content", () => {
  assertThrows(() => validateSavePayload({
    sourceType: "account",
    officeId: crypto.randomUUID(),
    departmentId: crypto.randomUUID(),
    salesOwnerId: crypto.randomUUID(),
    charges: [],
  }))
})
