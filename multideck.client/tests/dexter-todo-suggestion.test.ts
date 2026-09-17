import assert from "node:assert/strict"
import test from "node:test"
import { dexterTodoSuggestion } from "../src/lib/dexter-todo-suggestion.ts"
import { todoText } from "../src/lib/todo-text.ts"

const now = new Date("2026-08-19T10:00:00")

test("keeps quoted record links out of the title before the length limit", () => {
  const first = "/crm/deals?record=de1000dd-5eed-4ead-8000-000000000005"
  const second = "/crm/deals?record=de1000dd-5eed-4ead-8000-000000000006"
  const answer = `- **Follow up overdue opportunities:** [Meridian priority air freight](${first} "Meridian priority air freight") and [Horizon robotics expansion](${second} "Horizon robotics expansion")`
  const suggestion = dexterTodoSuggestion("What needs attention?", answer, { now })
  assert.equal(suggestion?.title, "Follow up overdue opportunities: Meridian priority air freight and Horizon robotics expansion")
  assert.deepEqual(suggestion?.links, [
    { label: "Meridian priority air freight", url: first },
    { label: "Horizon robotics expansion", url: second },
  ])
  assert.equal(todoText(answer.slice(0, 240)).title.includes("/crm/"), false)
})

test("repairs truncated older titles and preserves ordinary identifiers", () => {
  assert.equal(todoText('Follow up:** [Meridian](/crm/deals?id=123 "Meridian") and [Horizon](/crm/deals?id=').title, "Follow up: Meridian and Horizon")
  assert.equal(todoText("Check REF_A_123 & call Jo").title, "Check REF_A_123 & call Jo")
  assert.deepEqual(todoText("Review [guide](https://example.com/a_(b)) and [guide](https://example.com/a_(b))").links, [{ label: "guide", url: "https://example.com/a_(b)" }])
  assert.deepEqual(todoText("[bad](javascript:alert) [external](//example.com)").links, [])
})

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
