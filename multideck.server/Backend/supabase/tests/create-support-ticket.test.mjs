import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeStatusUrl,
  validateSupportTicketRequest,
} from "../functions/create-support-ticket/validation.ts"

const validRequest = {
  idempotencyKey: "support-form-stable-key",
  topic: "Security concern",
  priority: "Normal",
  title: "Cannot complete the booking",
  description: "The Continue button stays disabled after adding cargo.",
  applicationUrl: "https://dev.multideck.app/settings?tab=support",
}

test("normalises a valid support request without accepting requester identity", () => {
  const result = validateSupportTicketRequest({
    ...validRequest,
    requester: { email: "attacker@example.com" },
  })

  assert.deepEqual(result, {
    value: {
      idempotencyKey: "support-form-stable-key",
      topic: "Security concern",
      priority: "medium",
      title: "Cannot complete the booking",
      description: "The Continue button stays disabled after adding cargo.",
      applicationUrl: "https://dev.multideck.app/settings?tab=support",
    },
  })
  assert.equal("requester" in result.value, false)
})

test("rejects a changed payload that attempts to reuse an unsafe key", () => {
  const result = validateSupportTicketRequest({
    ...validRequest,
    idempotencyKey: "support form with spaces",
  })

  assert.deepEqual(result, { message: "Start a new ticket and try again." })
})

test("rejects unsupported topics, priorities, short descriptions, and unsafe URLs", () => {
  assert.deepEqual(
    validateSupportTicketRequest({ ...validRequest, topic: "Other" }),
    { message: "Choose a valid support topic." },
  )
  assert.deepEqual(
    validateSupportTicketRequest({ ...validRequest, priority: "Low" }),
    { message: "Choose a valid ticket priority." },
  )
  assert.deepEqual(
    validateSupportTicketRequest({ ...validRequest, description: "Too short" }),
    { message: "Add at least 20 characters explaining what happened and what you expected." },
  )
  assert.deepEqual(
    validateSupportTicketRequest({ ...validRequest, applicationUrl: "javascript:alert(1)" }),
    { message: "Refresh the page and try again." },
  )
})

test("only returns HTTPS ticket status links", () => {
  assert.equal(
    normalizeStatusUrl("https://os.databrain.solutions/ticket-status/example"),
    "https://os.databrain.solutions/ticket-status/example",
  )
  assert.equal(normalizeStatusUrl("http://example.com/ticket"), null)
  assert.equal(normalizeStatusUrl("javascript:alert(1)"), null)
})
