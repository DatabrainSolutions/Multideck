import assert from "node:assert/strict"
import test from "node:test"
import { createQuoteSaveQueue } from "../src/lib/quote-save-queue.ts"
import { captureAuthenticatedScope, setCrmReadCacheScope } from "../src/lib/crm-read-cache.ts"

test("edits arriving during a save commit in order with no overlapping writes", async () => {
  const save = createQuoteSaveQueue()
  const calls = []
  let finishFirst
  const first = save("project:user:quote", () => { calls.push("customer A"); return new Promise((resolve) => { finishFirst = resolve }) })
  const second = save("project:user:quote", async () => { calls.push("customer B and latest PO"); return "second" })
  await Promise.resolve()
  assert.deepEqual(calls, ["customer A"])
  finishFirst("first")
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"])
  assert.deepEqual(calls, ["customer A", "customer B and latest PO"])
})

test("a failed request does not swallow the next edit or prevent an explicit retry", async () => {
  const save = createQuoteSaveQueue()
  let fail
  const first = save("quote", () => new Promise((_, reject) => { fail = reject }))
  const error = assert.rejects(first, /offline/)
  const next = save("quote", async () => "latest edit")
  await Promise.resolve()
  fail(new Error("offline"))
  await error
  assert.equal(await next, "latest edit")
  assert.equal(await save("quote", async () => "retry"), "retry")
})

test("different quote scopes can save independently while a slow request is pending", async () => {
  const save = createQuoteSaveQueue()
  let finish
  const slow = save("project-a:user:quote", () => new Promise((resolve) => { finish = resolve }))
  assert.equal(await save("project-b:user:quote", async () => "other project"), "other project")
  finish("done")
  await slow
})

test("queued writes from a revoked session never start under the next account", async () => {
  setCrmReadCacheScope("project", "first-user")
  const save = createQuoteSaveQueue()
  const assertCurrent = captureAuthenticatedScope("first-user")
  let finish
  const first = save("quote", () => new Promise((resolve) => { finish = resolve }))
  let sent = false
  const queued = save("quote", async () => { assertCurrent(); sent = true })
  const rejected = assert.rejects(queued, { name: "AbortError" })
  await Promise.resolve()
  setCrmReadCacheScope("project", "second-user")
  finish()
  await Promise.all([first, rejected])
  assert.equal(sent, false)
})

test("reopening a quote waits for its commit without waiting for another quote", async () => {
  const save = createQuoteSaveQueue()
  let commit
  let read = false
  const saving = save("quote-a", () => new Promise((resolve) => { commit = resolve }))
  const reading = save.waitForIdle("quote-a").then(() => { read = true })
  await save.waitForIdle("quote-b")
  assert.equal(read, false)
  commit()
  await Promise.all([saving, reading])
  assert.equal(read, true)
  const failed = save("quote-a", async () => { throw new Error("offline") })
  await assert.rejects(failed, /offline/)
  await save.waitForIdle("quote-a")
})
