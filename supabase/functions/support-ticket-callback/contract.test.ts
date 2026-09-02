import { assertEquals, assertThrows } from "jsr:@std/assert@1"
import { isFreshTimestamp, parseCloudTicketCallback } from "./contract.ts"

const event = {
  eventId: "11111111-1111-4111-8111-111111111111",
  ticketId: "22222222-2222-4222-8222-222222222222",
  reference: "MD-00001",
  reporterUserId: "33333333-3333-4333-8333-333333333333",
  status: "in_progress",
  ticketType: "bug" as const,
  restricted: false as const,
  needsReply: true,
  messageId: null,
  changedAt: "2026-08-28T12:00:00.000Z",
  tenantHost: "tenant.multideck.app",
}

Deno.test("parses the minimal signed callback contract", () => {
  assertEquals(parseCloudTicketCallback(event), event)
})

Deno.test("rejects invalid identifiers, statuses and tenant hosts", () => {
  assertThrows(() => parseCloudTicketCallback({ ...event, ticketId: "wrong" }))
  assertThrows(() => parseCloudTicketCallback({ ...event, status: "security_concern" }))
  assertThrows(() => parseCloudTicketCallback({ ...event, ticketType: "security_concern" }))
  assertThrows(() => parseCloudTicketCallback({ ...event, restricted: true }))
  assertThrows(() => parseCloudTicketCallback({ ...event, tenantHost: "https://tenant.multideck.app" }))
})

Deno.test("enforces the replay window", () => {
  assertEquals(isFreshTimestamp("1787918400", 1787918400), true)
  assertEquals(isFreshTimestamp("1787918099", 1787918400), false)
  assertEquals(isFreshTimestamp("not-a-time", 1787918400), false)
})
