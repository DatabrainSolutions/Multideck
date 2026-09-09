import assert from "node:assert/strict"
import test from "node:test"
import { createTrainingAccessCache } from "../src/lib/training-access.ts"
import { isPublicWorkspacePath, validateTrainingConfiguration, workspaceStorageKey } from "../src/lib/workspace-environment.ts"

const grant = (token = "training-token", seconds = 300) => ({ accessToken: token, expiresAt: Date.now() / 1000 + seconds, authUserId: "actor", projectUrl: "https://training.supabase.co" })

test("training requires a distinct HTTPS project and a public key", () => {
  const main = "https://main.supabase.co"
  assert.equal(validateTrainingConfiguration(main, "https://training.supabase.co", "public-key"), null)
  for (const [url, key] of [["", ""], [main, "key"], ["http://training.supabase.co", "key"], ["https://training.supabase.co", ""], ["https://user:pass@training.supabase.co", "key"], ["https://training.supabase.co/path", "key"]]) {
    assert.equal(typeof validateTrainingConfiguration(main, url, key), "string")
  }
})

test("public links are recognised separately from private operator pages", () => {
  for (const path of ["/book/person/meeting", "/card/shared", "/quotes/respond/token", "/meetings/manage/token"]) assert.equal(isPublicWorkspacePath(path), true)
  for (const path of ["/quotes/jq20016", "/auth", "/calendar", "/crm/contact-cards/123"]) assert.equal(isPublicWorkspacePath(path), false)
})

test("concurrent requests share one grant and fresh reads need no handoff", async () => {
  const cache = createTrainingAccessCache()
  let resolve, calls = 0
  const load = () => { calls++; return new Promise(done => { resolve = done }) }
  const first = cache.get("main-token", load)
  const second = cache.get("main-token", load)
  resolve(grant())
  assert.deepEqual(await first, await second)
  await cache.get("main-token", load)
  assert.equal(calls, 1)
  assert.equal(cache.accepts("training-token", "main-token"), true)
  assert.equal(cache.accepts("training-token", "other-user"), false)
})

test("sign-out invalidates pending grants and prevents stale token reuse", async () => {
  const cache = createTrainingAccessCache()
  let resolve
  const pending = cache.get("main-token", () => new Promise(done => { resolve = done }))
  cache.clear()
  resolve(grant())
  await assert.rejects(pending, /session changed/)
  assert.equal(cache.accepts("training-token", "main-token"), false)
})

test("a later identity supersedes a pending earlier identity", async () => {
  const cache = createTrainingAccessCache()
  let resolveOld
  const old = cache.get("old-main", () => new Promise(done => { resolveOld = done }))
  await cache.get("new-main", async () => grant("new-training"))
  resolveOld(grant("old-training"))
  await assert.rejects(old, /session changed/)
  assert.equal(cache.accepts("old-training", "new-main"), false)
  assert.equal(cache.accepts("new-training", "new-main"), true)
})

test("expiry renews the grant, and a failed handoff can be retried", async () => {
  const cache = createTrainingAccessCache()
  await assert.rejects(cache.get("main", async () => { throw new Error("offline") }), /offline/)
  await cache.get("main", async () => grant("old", 15))
  const renewed = await cache.get("main", async () => grant("new"))
  assert.equal(renewed.accessToken, "new")
  assert.equal(cache.accepts("old", "main"), true)
  cache.clear()
  assert.equal(cache.accepts("old", "main"), false)
})

test("operational drafts cannot cross Main, Training or a different Training project", () => {
  const main = workspaceStorageKey("draft", "main", "https://training.supabase.co")
  const training = workspaceStorageKey("draft", "training", "https://training.supabase.co")
  const other = workspaceStorageKey("draft", "training", "https://other.supabase.co")
  assert.equal(main, "draft")
  assert.equal(new Set([main, training, other]).size, 3)
})
