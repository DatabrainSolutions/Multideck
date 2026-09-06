import { assertEquals, assertThrows } from "jsr:@std/assert@1"
import { parseAction, parseModeChangeConfirmation, parsePayload, parseQuoteSyncFields, parseQuoteReviewToken, parseReference, parseSequenceKey, parseUuid, toClientError } from "./core.ts"

Deno.test("booking workflow accepts only its explicit operations", () => {
  assertEquals(parseAction("open"), "open")
  assertEquals(parseAction("send-to-customs"), "send-to-customs")
  assertThrows(() => parseAction("delete"))
})

Deno.test("booking identifiers reject malformed or path-like values", () => {
  const id = crypto.randomUUID()
  assertEquals(parseUuid(id, "Booking"), id)
  assertEquals(parseReference("b-2041"), "B-2041")
  assertThrows(() => parseUuid("not-a-uuid", "Booking"))
  assertThrows(() => parseReference("../B-2041"))
  assertThrows(() => parseSequenceKey("../../default"))
})

Deno.test("booking updates stay object-shaped and bounded", () => {
  assertEquals(parsePayload({ direction: "export" }), { direction: "export" })
  assertThrows(() => parsePayload([]))
  assertThrows(() => parsePayload({ notes: "x".repeat(500_001) }))
})

Deno.test("quote sync fields are bounded and unique", () => {
  assertEquals(parseAction("quote-sync-review"), "quote-sync-review")
  assertEquals(parseAction("apply-quote-sync"), "apply-quote-sync")
  assertEquals(parseQuoteSyncFields(["mode", "estimatedArrival"]), ["mode", "estimatedArrival"])
  assertThrows(() => parseQuoteSyncFields([]))
  assertThrows(() => parseQuoteSyncFields(["mode", "mode"]))
})

Deno.test("mode changes require an explicit boolean confirmation", () => {
  assertEquals(parseModeChangeConfirmation(undefined), false)
  assertEquals(parseModeChangeConfirmation(false), false)
  assertEquals(parseModeChangeConfirmation(true), true)
  assertThrows(() => parseModeChangeConfirmation("true"))
})

Deno.test("cargo review selections allow only individual source-line fields", () => {
  const id = crypto.randomUUID()
  const key = `cargo:${id}:grossWeightKg`
  assertEquals(parseQuoteSyncFields([key, "customerNotes"]), [key, "customerNotes"])
  assertEquals(parseQuoteSyncFields(Array.from({ length: 40 }, () => `cargo:${crypto.randomUUID()}:line`)).length, 40)
  for (const invalid of [[key, key], [`cargo:${id}:sellAmount`], [`cargo:${id}:__proto__`], ["cargo:../../:line"], [null], Array(8031).fill(key)]) {
    assertThrows(() => parseQuoteSyncFields(invalid))
  }
})

Deno.test("quote review tokens and stale errors require an explicit refresh", () => {
  assertEquals(parseQuoteReviewToken("a".repeat(64)), "a".repeat(64))
  for (const invalid of [undefined, null, "", "a".repeat(63), "g".repeat(64)]) assertThrows(() => parseQuoteReviewToken(invalid))
  assertEquals(toClientError({ code: "40001", message: "private diagnostic" }).status, 409)
  assertEquals(toClientError({ code: "40001" }).clientMessage.includes("Refresh"), true)
})
