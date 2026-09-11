import assert from "node:assert/strict"
import test from "node:test"
import { dexterArtifactReferences, retainDexterRenderKeys } from "../src/lib/dexter-response-presentation.ts"

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
