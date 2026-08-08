import assert from "node:assert/strict"
import test from "node:test"

import {
  clearWarehouseReadCache,
  invalidateWarehouseResources,
  readCachedWarehouseResource,
} from "../src/lib/warehouse-read-cache.ts"

test.beforeEach(() => clearWarehouseReadCache())

test("deduplicates concurrent reads and reuses a fresh warehouse result", async () => {
  let calls = 0
  let resolveLoad
  const load = () => {
    calls += 1
    return new Promise((resolve) => { resolveLoad = resolve })
  }

  const first = readCachedWarehouseResource("tenant-a:user-1", "/orders?openOnly=true", load)
  const second = readCachedWarehouseResource("tenant-a:user-1", "/orders?openOnly=true", load)
  assert.equal(calls, 1)

  resolveLoad([{ id: "order-1" }])
  assert.deepEqual(await Promise.all([first, second]), [[{ id: "order-1" }], [{ id: "order-1" }]])
  assert.deepEqual(await readCachedWarehouseResource("tenant-a:user-1", "/orders?openOnly=true", load), [{ id: "order-1" }])
  assert.equal(calls, 1)
})

test("keeps warehouse data scoped to both tenant and signed-in user", async () => {
  let calls = 0
  const load = async () => ({ request: ++calls })

  assert.deepEqual(await readCachedWarehouseResource("tenant-a:user-1", "/inventory", load), { request: 1 })
  assert.deepEqual(await readCachedWarehouseResource("tenant-a:user-2", "/inventory", load), { request: 2 })
  assert.deepEqual(await readCachedWarehouseResource("tenant-b:user-1", "/inventory", load), { request: 3 })
  assert.equal(calls, 3)
})

test("expiry, force refresh, and mutation invalidation fetch a new value", async () => {
  let calls = 0
  const load = async () => ++calls
  const scope = "tenant-a:user-1"

  assert.equal(await readCachedWarehouseResource(scope, "/inventory", load), 1)
  assert.equal(await readCachedWarehouseResource(scope, "/inventory", load, { forceRefresh: true }), 2)
  assert.equal(await readCachedWarehouseResource(scope, "/inventory", load, {}, 0), 3)
  invalidateWarehouseResources(scope)
  assert.equal(await readCachedWarehouseResource(scope, "/inventory", load), 4)
})

test("an invalidated in-flight read cannot restore stale data after a mutation", async () => {
  const scope = "tenant-a:user-1"
  let resolveFirst
  let calls = 0
  const firstLoad = () => {
    calls += 1
    return new Promise((resolve) => { resolveFirst = resolve })
  }

  const staleRead = readCachedWarehouseResource(scope, "/orders", firstLoad)
  invalidateWarehouseResources(scope)
  resolveFirst(["stale-order"])
  assert.deepEqual(await staleRead, ["stale-order"])

  const freshRead = await readCachedWarehouseResource(scope, "/orders", async () => {
    calls += 1
    return ["fresh-order"]
  })
  assert.deepEqual(freshRead, ["fresh-order"])
  assert.equal(calls, 2)
})

test("failed reads are not cached", async () => {
  let calls = 0
  const load = async () => {
    calls += 1
    if (calls === 1) throw new Error("temporary failure")
    return ["recovered"]
  }

  await assert.rejects(readCachedWarehouseResource("tenant-a:user-1", "/inventory", load), /temporary failure/)
  assert.deepEqual(await readCachedWarehouseResource("tenant-a:user-1", "/inventory", load), ["recovered"])
  assert.equal(calls, 2)
})
