import assert from "node:assert/strict"
import test from "node:test"

import {
  clearCrmReadCache,
  invalidateCrmResources,
  readCachedCrmResource,
  setCrmReadCacheScope,
} from "../src/lib/crm-read-cache.ts"

test.beforeEach(() => { setCrmReadCacheScope("project-a", "user-1"); clearCrmReadCache() })

test("deduplicates concurrent reads and reuses a fresh result", async () => {
  let calls = 0
  let resolveLoad
  const load = () => {
    calls += 1
    return new Promise((resolve) => { resolveLoad = resolve })
  }

  const first = readCachedCrmResource("user-1", "accounts", load)
  const second = readCachedCrmResource("user-1", "accounts", load)
  assert.equal(calls, 1)

  resolveLoad(["account-1"])
  assert.deepEqual(await Promise.all([first, second]), [["account-1"], ["account-1"]])
  assert.deepEqual(await readCachedCrmResource("user-1", "accounts", load), ["account-1"])
  assert.equal(calls, 1)
})

test("keeps cached data scoped to the signed-in user", async () => {
  let calls = 0
  const load = async () => [`request-${++calls}`]

  assert.deepEqual(await readCachedCrmResource("user-1", "leads", load), ["request-1"])
  setCrmReadCacheScope("project-a", "user-2")
  assert.deepEqual(await readCachedCrmResource("user-2", "leads", load), ["request-2"])
  await assert.rejects(readCachedCrmResource("user-1", "leads", load), { name: "AbortError" })
  assert.equal(calls, 2)
})

test("force refresh and invalidation fetch a new value", async () => {
  let calls = 0
  const load = async () => ++calls

  assert.equal(await readCachedCrmResource("user-1", "contacts", load), 1)
  assert.equal(await readCachedCrmResource("user-1", "contacts", load, { forceRefresh: true }), 2)
  invalidateCrmResources("user-1", ["contacts"])
  assert.equal(await readCachedCrmResource("user-1", "contacts", load), 3)
})

test("an invalidated in-flight read cannot put stale data back into the cache", async () => {
  let calls = 0
  let resolveFirst
  const firstLoad = () => {
    calls += 1
    return new Promise((resolve) => { resolveFirst = resolve })
  }

  const staleRequest = readCachedCrmResource("user-1", "accounts:all", firstLoad)
  invalidateCrmResources("user-1", ["accounts:"])

  assert.equal(await readCachedCrmResource("user-1", "accounts:all", async () => {
    calls += 1
    return "fresh"
  }), "fresh")

  resolveFirst("stale")
  await assert.rejects(staleRequest, { name: "AbortError" })
  assert.equal(await readCachedCrmResource("user-1", "accounts:all", async () => "unexpected"), "fresh")
  assert.equal(calls, 2)
})

test("account, project and access changes reject pending responses, including same-user re-entry", async () => {
  for (const change of [
    () => setCrmReadCacheScope("project-a", "user-2"),
    () => setCrmReadCacheScope("project-b", "user-1"),
    () => setCrmReadCacheScope("project-a", "user-1", true),
    () => { setCrmReadCacheScope("project-a", null); setCrmReadCacheScope("project-a", "user-1") },
  ]) {
    setCrmReadCacheScope("project-a", "user-1", true)
    let resolve
    const pending = readCachedCrmResource("user-1", "quote-sources", () => new Promise(done => { resolve = done }))
    change()
    resolve({ account: "old" })
    await assert.rejects(pending, { name: "AbortError" })
  }
})

test("CRM changes invalidate quote sources and expiry refetches within the freshness boundary", async () => {
  let calls = 0
  const load = async () => ++calls
  assert.equal(await readCachedCrmResource("user-1", "quote-sources", load), 1)
  invalidateCrmResources("user-1", ["contact-detail:changed"])
  assert.equal(await readCachedCrmResource("user-1", "quote-sources", load), 2)
  assert.equal(await readCachedCrmResource("user-1", "quote-sources", load, {}, 0), 3)
})

test("completed entries are bounded while recently used entries remain available", async () => {
  await readCachedCrmResource("user-1", "oldest", async () => "old")
  await readCachedCrmResource("user-1", "frequent", async () => "kept")
  for (let i = 0; i < 130; i++) {
    await readCachedCrmResource("user-1", `record:${i}`, async () => i)
    await readCachedCrmResource("user-1", "frequent", async () => "unexpected")
  }
  assert.equal(await readCachedCrmResource("user-1", "frequent", async () => "unexpected"), "kept")
  assert.equal(await readCachedCrmResource("user-1", "oldest", async () => "new"), "new")
})
