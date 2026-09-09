import assert from "node:assert/strict"
import test from "node:test"
import { dexterTodoSuggestion } from "../src/lib/dexter-todo-suggestion.ts"

const now = new Date("2026-08-19T10:00:00")

test("builds a dated, prioritised task from an explicit Dexter request", () => {
  assert.deepEqual(
    dexterTodoSuggestion(
      "Remind me to chase MD-22455 tomorrow, urgent",
      "The booking is ready to review at [MD-22455](/bookings/md-22455).",
      { now },
    ),
    {
      title: "chase MD-22455 tomorrow, urgent",
      scheduledDate: "2026-08-20",
      priority: "urgent",
      links: [{ label: "MD-22455", url: "/bookings/md-22455" }],
      tags: [{ label: "MD-22455" }],
    },
  )
})

test("offers a task only when the response contains a relevant next action", () => {
  assert.equal(dexterTodoSuggestion("What should I do?", "Everything is up to date.", { now }), null)
  assert.equal(
    dexterTodoSuggestion("What should I do?", "Next action: confirm the collection slot.", { now })?.title,
    "confirm the collection slot.",
  )
})

test("does not compete with streaming, draft, approval, or already-completed actions", () => {
  assert.equal(dexterTodoSuggestion("Add a task to call Jo", "I can help.", { now, streaming: true }), null)
  assert.equal(dexterTodoSuggestion("Add a task to call Jo", "I can help.", { now, pendingAction: true }), null)
  assert.equal(dexterTodoSuggestion("Add a task to call Jo", "I can help.", { now, emailDraft: true }), null)
  assert.equal(dexterTodoSuggestion("Add a task to call Jo", "I added it to your To Do list.", { now }), null)
})
