import { assertEquals, assertThrows } from "jsr:@std/assert@1"
import { parseAction, parseLifecycleAction, parseReference, validateSavePayload } from "./core.ts"

Deno.test("accepts the explicit quote workflow actions", () => {
  assertEquals(parseAction("convert"), "convert")
  assertEquals(parseLifecycleAction("accepted"), "accepted")
})

Deno.test("rejects unsupported actions and malformed references", () => {
  assertThrows(() => parseAction("delete"))
  assertThrows(() => parseReference("../Q-22"))
})

Deno.test("requires an exact lead or account source", () => {
  assertThrows(() => validateSavePayload({ sourceType: "email", sourceId: crypto.randomUUID() }))
  const payload = validateSavePayload({ sourceType: "lead", sourceId: crypto.randomUUID(), charges: [] })
  assertEquals(payload.sourceType, "lead")
})
