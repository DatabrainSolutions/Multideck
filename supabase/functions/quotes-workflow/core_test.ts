import { assertEquals, assertThrows } from "jsr:@std/assert@1"
import { parseAction, parseLifecycleAction, parseReference, validateSavePayload } from "./core.ts"

Deno.test("accepts the explicit quote workflow actions", () => {
  assertEquals(parseAction("save"), "save")
  assertEquals(parseLifecycleAction("accepted"), "accepted")
})

Deno.test("rejects unsupported actions and malformed references", () => {
  assertThrows(() => parseAction("delete"))
  assertThrows(() => parseReference("../Q-22"))
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
