import assert from "node:assert/strict"
import test from "node:test"
import { workspaceNotificationDestination as destination } from "../src/lib/notification-destination.ts"

const origin = "https://jenkar.multideck.app"
test("Inbox notifications without URLs open their specific suggestion", () => {
  assert.equal(destination({ metadata: {}, targetTable: "AI_InboxSuggestedUpdates", targetId: "review-1" }, origin), "/inbox?view=suggested&suggestion=review-1")
  assert.equal(destination({ metadata: { suggestion_id: "completed-1", booking_id: "job-1" } }, origin), "/inbox?view=suggested&suggestion=completed-1")
})
test("valid explicit links preserve the destination, query and anchor", () => {
  assert.equal(destination({ metadata: { action_url: "/quotes/Q-1?tab=notes#note" } }, origin), "/quotes/Q-1?tab=notes#note")
  assert.equal(destination({ metadata: { action_url: `${origin}/bookings/b-1` } }, origin), "/bookings/b-1")
  assert.equal(destination({ metadata: { action_url: "", url: "/agent-dexter?watch=1" } }, origin), "/agent-dexter?watch=1")
})
test("links cannot navigate into another tenant or run script", () => {
  for (const action_url of ["https://another.multideck.app/quotes/1", "//evil.example/a", "/\\evil.example/a", "javascript:alert(1)"]) {
    assert.equal(destination({ metadata: { action_url } }, origin), null)
  }
})
test("record references resolve without confusing transfer IDs with lead IDs", () => {
  assert.equal(destination({ metadata: {}, targetTable: "CRM_Leads", targetId: "lead-1" }, origin), "/crm/leads/lead-1")
  assert.equal(destination({ metadata: { leadId: "lead-1" }, targetTable: "CRM_LeadTransferRequests", targetId: "request-1" }, origin), "/crm/leads/lead-1")
  assert.equal(destination({ metadata: {} }, origin), null)
})
