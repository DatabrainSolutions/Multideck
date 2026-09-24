import assert from "node:assert/strict"
import test from "node:test"
import {
  dexterConversationIdFromUrl,
  rememberDexterTaskHandoff,
  rememberDexterTodoHandoff,
  shouldSendDexterTodoHandoff,
  shouldReuseDexterConversation,
  takeDexterTaskHandoff,
  takeDexterTodoHandoff,
} from "../src/lib/dexter-navigation.ts"

const conversationId = "4dc88aeb-0edb-44e6-9f33-e4aff8d8ab47"

test("restores a valid Dexter conversation id from the URL", () => {
  assert.equal(
    dexterConversationIdFromUrl(`/agent-dexter?conversation=${conversationId}`),
    conversationId,
  )
})

test("a To Do handoff survives navigation, is consumed once, and sends only in its empty saved thread", () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    } },
  })
  try {
    rememberDexterTodoHandoff(conversationId, "  Check the quote  ")
    assert.deepEqual(takeDexterTodoHandoff(), { conversationId, prompt: "Check the quote" })
    assert.equal(takeDexterTodoHandoff(), null)
    assert.equal(shouldSendDexterTodoHandoff(conversationId, conversationId, 0, false), true)
    assert.equal(shouldSendDexterTodoHandoff(conversationId, conversationId, 0, true), false)
    assert.equal(shouldSendDexterTodoHandoff(conversationId, conversationId, 1, false), false)
    assert.equal(shouldSendDexterTodoHandoff(conversationId, "aaf5ba37-cc8d-4e6e-86a2-5074b2111ce7", 0, false), false)
    rememberDexterTodoHandoff("bad-id", "Should not send")
    assert.equal(takeDexterTodoHandoff(), null)
  } finally {
    delete (globalThis as { window?: unknown }).window
  }
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

test("hands a dashboard task to Dexter once without sending it", () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  })

  try {
    rememberDexterTaskHandoff("  Review quote Q-19157  ")
    assert.equal(takeDexterTaskHandoff(), "Review quote Q-19157")
    assert.equal(takeDexterTaskHandoff(), null)

    rememberDexterTaskHandoff("   ")
    assert.equal(takeDexterTaskHandoff(), null)
  } finally {
    delete (globalThis as { window?: unknown }).window
  }
})
