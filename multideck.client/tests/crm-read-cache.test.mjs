import assert from "node:assert/strict"
import test from "node:test"

import {
  clearCrmReadCache,
  invalidateCrmResources,
  readCachedCrmResource,
} from "../src/lib/crm-read-cache.ts"

test.beforeEach(() => clearCrmReadCache())

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
  assert.deepEqual(await readCachedCrmResource("user-2", "leads", load), ["request-2"])
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
  assert.equal(await staleRequest, "stale")
  assert.equal(await readCachedCrmResource("user-1", "accounts:all", async () => "unexpected"), "fresh")
  assert.equal(calls, 2)
})
