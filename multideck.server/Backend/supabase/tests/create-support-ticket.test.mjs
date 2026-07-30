import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeStatusUrl,
  validateSupportTicketRequest,
} from "../functions/create-support-ticket/validation.ts"
import {
  buildDatabrainTicketPayload,
  mapDatabrainFailure,
  parseConfirmedTicketResponse,
} from "../functions/create-support-ticket/contract.ts"

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

test("maps the authenticated requester and keeps credentials out of the Databrain payload", () => {
  const normalized = validateSupportTicketRequest(validRequest)
  assert.ok(normalized.value)

  const payload = buildDatabrainTicketPayload(normalized.value, {
    name: "Alex Operator",
    email: "alex@example.com",
    companyName: "Example Logistics",
  })

  assert.deepEqual(payload, {
    idempotencyKey: "support-form-stable-key",
    sourceApplication: "multideck",
    title: "Cannot complete the booking",
    description: "The Continue button stays disabled after adding cargo.",
    requester: {
      name: "Alex Operator",
      email: "alex@example.com",
    },
    clientName: "Example Logistics",
    categorySlug: "general",
    priority: "medium",
    metadata: {
      topic: "Security concern",
      requestedPriority: "medium",
      applicationUrl: "https://dev.multideck.app/settings?tab=support",
    },
  })

  const serialized = JSON.stringify(payload).toLowerCase()
  assert.equal(serialized.includes("secret"), false)
  assert.equal(serialized.includes("authorization"), false)
  assert.equal(serialized.includes("cookie"), false)
})

test("keeps the stable idempotency key on every mapping", () => {
  const normalized = validateSupportTicketRequest(validRequest)
  assert.ok(normalized.value)
  const requester = {
    name: "Alex Operator",
    email: "alex@example.com",
    companyName: "Example Logistics",
  }

  assert.equal(
    buildDatabrainTicketPayload(normalized.value, requester).idempotencyKey,
    buildDatabrainTicketPayload(normalized.value, requester).idempotencyKey,
  )
})

test("maps upstream validation, configuration, conflict, size, and availability failures", () => {
  assert.deepEqual(mapDatabrainFailure(400), {
    status: 400,
    body: {
      code: "validation_error",
      message: "Check the ticket details and try again.",
    },
  })
  assert.equal(mapDatabrainFailure(401).status, 503)
  assert.equal(mapDatabrainFailure(409).body.code, "idempotency_conflict")
  assert.equal(mapDatabrainFailure(413).body.code, "ticket_too_large")
  assert.equal(mapDatabrainFailure(500).status, 503)
  assert.equal(mapDatabrainFailure(502).status, 503)
})

test("returns only confirmed success and preserves duplicate responses", () => {
  const created = parseConfirmedTicketResponse({
    ticket: {
      ticketNumber: "TK-2048",
      status: "open",
      createdAt: "2026-07-30T10:00:00Z",
      statusUrl: "https://os.databrain.solutions/ticket-status/example",
    },
    duplicate: false,
  })
  assert.equal(created.status, 201)
  assert.equal(created.body.ticket.ticketNumber, "TK-2048")
  assert.equal(created.body.duplicate, false)

  const duplicate = parseConfirmedTicketResponse({
    ticket: {
      ticketNumber: "TK-2048",
      status: "open",
      createdAt: "2026-07-30T10:00:00Z",
      statusUrl: null,
    },
    duplicate: true,
  })
  assert.equal(duplicate.status, 200)
  assert.equal(duplicate.body.duplicate, true)

  assert.equal(parseConfirmedTicketResponse({
    ticket: {
      status: "open",
      createdAt: "2026-07-30T10:00:00Z",
    },
    duplicate: false,
  }), null)
})
