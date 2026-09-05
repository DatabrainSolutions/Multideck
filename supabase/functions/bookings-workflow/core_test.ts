import { assertEquals, assertThrows } from "jsr:@std/assert@1"
import { parseAction, parseModeChangeConfirmation, parsePayload, parseQuoteSyncFields, parseReference, parseSequenceKey, parseUuid } from "./core.ts"

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
