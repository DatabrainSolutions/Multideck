import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { createCardVisit } from "../src/lib/contact-card-visit.ts"
import { contactCardSubmissionError } from "../src/lib/contact-card-errors.ts"

test("repeat opens share a short-lived session, never a request ID or another card's session", () => {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
  const first = createCardVisit("a", storage, 1000, randomUUID)
  const repeat = createCardVisit("a", storage, 2000, randomUUID)
  assert.notEqual(first.requestId, repeat.requestId)
  assert.equal(first.sessionId, repeat.sessionId)
  assert.notEqual(createCardVisit("b", storage, 2000, randomUUID).sessionId, first.sessionId)
  assert.notEqual(createCardVisit("a", storage, 2_000_000, randomUUID).sessionId, first.sessionId)
})

test("private-mode, corrupt and unavailable storage cannot break a public card", () => {
  const denied = { getItem: () => { throw new Error("denied") }, setItem: () => { throw new Error("denied") } }
  const corrupt = { getItem: () => "invalid-json", setItem: () => {} }
  for (const storage of [null, denied, corrupt]) {
    const visit = createCardVisit("a", storage, 1000, randomUUID)
    assert.match(visit.requestId, /^[a-f0-9-]{36}$/)
    assert.match(visit.sessionId, /^[a-f0-9-]{36}$/)
  }
})

test("uncertain submissions preserve the exact request, explicit rejections permit correction", () => {
  assert.equal(contactCardSubmissionError(new TypeError("Failed to fetch"), true).pending, true)
  assert.equal(contactCardSubmissionError({ code: "", message: "timeout" }, true).pending, true)
  assert.equal(contactCardSubmissionError(new Error("offline"), false).pending, false)
  assert.equal(contactCardSubmissionError({ code: "22023", message: "This contact-card submission has expired." }, true).renew, true)
  for (const code of ["P0001", "P0002", "22023", "PGRST202"]) assert.equal(contactCardSubmissionError({ code }, true).pending, false)
  assert.ok(!contactCardSubmissionError({ message: "secret server internals" }, true).message.includes("secret"))
})
