import assert from "node:assert/strict"
import test from "node:test"
import {
  dexterConversationIdFromUrl,
  shouldReuseDexterConversation,
} from "../src/lib/dexter-navigation.ts"

const conversationId = "4dc88aeb-0edb-44e6-9f33-e4aff8d8ab47"

test("restores a valid Dexter conversation id from the URL", () => {
  assert.equal(
    dexterConversationIdFromUrl(`/agent-dexter?conversation=${conversationId}`),
    conversationId,
  )
})

test("ignores missing or malformed Dexter conversation ids", () => {
  assert.equal(dexterConversationIdFromUrl("/agent-dexter"), null)
  assert.equal(dexterConversationIdFromUrl("/agent-dexter?conversation=not-a-conversation"), null)
})

test("does not reuse stale thread state after New chat is selected", () => {
  assert.equal(shouldReuseDexterConversation(conversationId, null), false)
  assert.equal(shouldReuseDexterConversation(conversationId, conversationId), true)
  assert.equal(
    shouldReuseDexterConversation(conversationId, "aaf5ba37-cc8d-4e6e-86a2-5074b2111ce7"),
    false,
  )
})
