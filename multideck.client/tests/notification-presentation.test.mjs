import assert from "node:assert/strict"
import test from "node:test"
import { describeNotification, notificationBodyParts, notificationDayGroup, notificationTimeLabel } from "../src/lib/notification-presentation.ts"

const base = { title: "Update", body: "", priority: "normal", targetTable: null, metadata: {} }

test("a leading heading becomes the subject and leaves the rest as the preview", () => {
  assert.deepEqual(notificationBodyParts("# Kestrel air and ocean review\n\nThe overdue follow-up has been prepared."), { subject: "Kestrel air and ocean review", preview: "The overdue follow-up has been prepared." })
  assert.deepEqual(notificationBodyParts("Harry Phillips · 21 Sep 2026 · GBP 16.18"), { subject: null, preview: "Harry Phillips · 21 Sep 2026 · GBP 16.18" })
  assert.deepEqual(notificationBodyParts(""), { subject: null, preview: "" })
})

test("the producer's eyebrow and action label win over the derived ones", () => {
  const presentation = describeNotification({ ...base, title: "Q-1 customer response", targetTable: "CusQuote_Header", metadata: { event_type: "quote_response", decision: "declined", eyebrow: "Customer quote response", action_label: "Open quote" } })
  assert.equal(presentation.kind, "quote")
  assert.equal(presentation.tone, "critical")
  assert.equal(presentation.label, "Customer quote response")
  assert.equal(presentation.actionLabel, "Open quote")
})

test("a notification with nowhere to go offers no action", () => {
  assert.equal(describeNotification({ ...base, metadata: { action_label: "Open" } }, false).actionLabel, null)
})

test("Dexter tasks distinguish a ready result from one that needs attention", () => {
  assert.equal(describeNotification({ ...base, title: "Your task is ready to review", targetTable: "AI_DexterTaskAssignments" }).tone, "accent")
  assert.equal(describeNotification({ ...base, title: "Your task needs attention", targetTable: "AI_DexterTaskAssignments" }).tone, "attention")
})

test("high and urgent priorities are flagged; normal is not", () => {
  assert.equal(describeNotification({ ...base, priority: "high" }).priority, "high")
  assert.equal(describeNotification({ ...base, priority: "urgent" }).priority, "high")
  assert.equal(describeNotification(base).priority, "normal")
})

test("rows group by calendar day and label time for their group", () => {
  const now = new Date(2026, 8, 26, 10, 0)
  assert.equal(notificationDayGroup(new Date(2026, 8, 26, 9, 56).toISOString(), now), "today")
  assert.equal(notificationDayGroup(new Date(2026, 8, 25, 23, 59).toISOString(), now), "yesterday")
  assert.equal(notificationDayGroup(new Date(2026, 8, 21, 8, 0).toISOString(), now), "week")
  assert.equal(notificationDayGroup(new Date(2026, 8, 19, 8, 0).toISOString(), now), "older")
  assert.equal(notificationDayGroup("not a date", now), "older")
  assert.equal(notificationTimeLabel(new Date(2026, 8, 26, 9, 56).toISOString(), "en-GB", now), "4 min")
  assert.equal(notificationTimeLabel(new Date(2026, 8, 26, 9, 59, 40).toISOString(), "en-GB", now), "Now")
  assert.equal(notificationTimeLabel(new Date(2026, 8, 12, 8, 0).toISOString(), "en-GB", now), "12 Sept")
  assert.equal(notificationTimeLabel(new Date(2026, 8, 12, 8, 0).toISOString(), "en-US", now), "Sep 12")
})
