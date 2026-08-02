import assert from "node:assert/strict"
import test from "node:test"
import { findDexterMentionMatches } from "../src/lib/dexter-mention-matcher.ts"

const providers = ["Gmail", "Outlook"]

test("does not treat provider domains in email addresses as Dexter mentions", () => {
  assert.deepEqual(findDexterMentionMatches("Find hazphillips@outlook.com and ops@gmail.com", providers), [])
  assert.deepEqual(findDexterMentionMatches("Open https://mail.example/@outlook.com", providers), [])
})

test("still recognises deliberate provider mentions at valid boundaries", () => {
  assert.deepEqual(findDexterMentionMatches("Ask @Outlook, then (@Gmail).", providers), [
    { start: 4, end: 12, title: "Outlook" },
    { start: 20, end: 26, title: "Gmail" },
  ])
})

test("matches a provider mention at the start of a message case-insensitively", () => {
  assert.deepEqual(findDexterMentionMatches("@outlook find the invoice", providers), [
    { start: 0, end: 8, title: "outlook" },
  ])
})
