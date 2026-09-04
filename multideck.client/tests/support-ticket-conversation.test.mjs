import assert from "node:assert/strict"
import test from "node:test"
import { isSupportTicketConversation, isSupportTicketCursor, isSupportTicketMessage, isSupportTicketSummary } from "../src/lib/support-ticket-conversation.ts"

const ticket = { id: "ticket-a", reference: "MD-10007", title: "Test ticket", description: "Submitted details", ticketType: "bug", status: "new", needsReply: false, createdAt: "2026-09-04T21:15:00Z", updatedAt: "2026-09-04T21:15:00Z" }
const message = { id: "message-a", authorType: "customer", authorName: "Reporter", body: "Please check this", createdAt: "2026-09-04T21:15:00Z" }

test("accepts confirmed public conversation and empty message page", () => {
  assert.equal(isSupportTicketConversation({ ticket, messages: [message], nextCursor: null }, ticket.id), true)
  assert.equal(isSupportTicketConversation({ ticket, messages: [], nextCursor: null }, ticket.id), true)
})
test("rejects the wrong ticket, malformed dates and unsupported status", () => {
  assert.equal(isSupportTicketConversation({ ticket, messages: [], nextCursor: null }, "ticket-b"), false)
  assert.equal(isSupportTicketSummary({ ...ticket, status: "invented" }), false)
  assert.equal(isSupportTicketSummary({ ...ticket, updatedAt: "invalid" }), false)
  assert.equal(isSupportTicketSummary({ ...ticket, reference: "" }), false)
})
test("never renders internal or unconfirmed message responses", () => {
  for (const invalid of [undefined, {}, { ...message, internal: true }, { ...message, visibility: "internal" }, { ...message, authorType: "system" }, { ...message, createdAt: "invalid" }]) assert.equal(isSupportTicketMessage(invalid), false)
  assert.equal(isSupportTicketConversation({ ticket, messages: [{ ...message, internal: true }], nextCursor: null }, ticket.id), false)
})
test("requires an explicit pagination outcome instead of silently discarding missing metadata", () => {
  assert.equal(isSupportTicketCursor(null), true)
  assert.equal(isSupportTicketCursor("cursor"), true)
  assert.equal(isSupportTicketCursor(undefined), false)
  assert.equal(isSupportTicketCursor(""), false)
})
