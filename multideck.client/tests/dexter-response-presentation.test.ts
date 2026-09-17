import assert from "node:assert/strict"
import test from "node:test"
import { dexterArtifactReferences, retainDexterRenderKeys, structureDexterMeetingBrief } from "../src/lib/dexter-response-presentation.ts"

test("saved flat meeting briefs become an agenda with separate context and unchanged source URLs", () => {
  const text = 'Brief for Tuesday, BST. Meetings found: 09:30-10:00 Brainstormer, accepted: [Brainstormer](/calendar?date=2026-09-15 "Brainstormer"); 10:00-10:30 UCN Meeting, response needed: [UCN Meeting](/calendar?date=2026-09-15 "UCN Meeting"); 12:00-13:00 GTM, response needed: [GTM](/calendar?date=2026-09-15 "GTM"). There is a 12:15-12:45 overlap. Focus blocks were excluded. CRM searches found no match. No changes made.'
  const formatted = structureDexterMeetingBrief(text)
  assert.match(formatted, /Brief for Tuesday, BST\.\n\n## Meetings\n\n- \*\*09:30-10:00\*\* \[Brainstormer\]/)
  assert.equal((formatted.match(/^- /gm) ?? []).length, 3)
  assert.equal((formatted.match(/Brainstormer/g) ?? []).length, 2) // label and title, no repeated visible name
  assert.match(formatted, /\n\nThere is a 12:15-12:45 overlap\.\n\nFocus blocks were excluded\.\n\nCRM searches/)
  assert.deepEqual(formatted.match(/\]\([^\n]+?\)/g), text.match(/\]\([^\n]+?\)/g))
  assert.equal(structureDexterMeetingBrief(formatted), formatted)
})

test("formatting does not split times inside citation URLs or change existing Markdown and code", () => {
  const url = '/calendar?label=slot; 11:00-12:00&date=2026-09-15'
  const text = `Meetings found: 09:00-10:00 First: [First](${url} "First"); 12:00-13:00 Second: [Second](/calendar "Second").`
  const formatted = structureDexterMeetingBrief(text)
  assert.equal((formatted.match(/^- /gm) ?? []).length, 2)
  assert.ok(formatted.includes(url))
  for (const untouched of ['A single ordinary paragraph.', '## Meetings\n\n- 09:00 First\n- 10:00 Second', `\`\`\`text\n${text}\n\`\`\``, 'Meetings found: no confirmed matches.', 'Meetings found: 09:00-10:00 Only one.']) {
    assert.equal(structureDexterMeetingBrief(untouched), untouched)
  }
})

test("native tables below the response correct old positional wording only when a table exists", () => {
  const text = "The full list is displayed in the bookings table above. Check the booking reference."
  assert.equal(dexterArtifactReferences(text, true), "The full list is displayed in the bookings table below. Check the booking reference.")
  assert.equal(dexterArtifactReferences(text, false), text)
  assert.equal(dexterArtifactReferences("Check the warning above and the table below.", true), "Check the warning above and the table below.")
})

test("acknowledgement preserves the live response and parent DOM without changing saved IDs", () => {
  const completed = { messages: [
    { id: "old-user", role: "user" },
    { id: "saved-user", role: "user" },
    { id: "saved-answer", role: "assistant", responseToUserMessageId: "saved-user" },
  ] }
  const result = retainDexterRenderKeys(completed, { messages: [{ id: "old-user", role: "user", renderKey: "previous-pending" }] }, "streaming-1", "pending-1")
  assert.deepEqual(result.messages.map(message => message.id), ["old-user", "saved-user", "saved-answer"])
  assert.deepEqual(result.messages.map(message => (message as { renderKey?: string }).renderKey), ["previous-pending", "pending-1", "streaming-1"])
  assert.equal(result.messages[2].responseToUserMessageId, "saved-user")
  assert.equal("renderKey" in completed.messages[2], false)
})

test("retrying preserves the user and old attempts while retaining the new stream identity", () => {
  const completed = { messages: [
    { id: "user", role: "user", renderKey: "pending-user" },
    { id: "old-answer", role: "assistant", renderKey: "old-stream" },
    { id: "retry-answer", role: "assistant" },
  ] }
  const result = retainDexterRenderKeys(completed, completed, "retry-stream")
  assert.deepEqual(result.messages.map(message => message.renderKey), ["pending-user", "old-stream", "retry-stream"])
})
