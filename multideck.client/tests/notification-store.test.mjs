import assert from "node:assert/strict"
import test from "node:test"
import { createNotificationStore } from "../src/lib/notification-store.ts"

const flush = () => new Promise(setImmediate)
const notification = { id: "one", title: "Watch matched", body: "A quote changed", status: "unread", priority: "normal", metadata: {}, createdAt: "2026-09-03" }

test("desktop and mobile controls share one read, one connection and the same state", async () => {
  let connections = 0, reads = 0, disconnected = 0
  const store = createNotificationStore({
    load: async () => { reads += 1; return [notification] },
    connect: () => { connections += 1; return () => { disconnected += 1 } },
    onError: assert.fail,
  })
  const snapshots = []
  const desktop = store.subscribe(() => snapshots.push(store.getSnapshot()))
  const mobile = store.subscribe(() => snapshots.push(store.getSnapshot()))
  await flush()
  assert.equal(reads, 1)
  assert.equal(connections, 1)
  assert.equal(snapshots[0], snapshots[1])
  desktop()
  assert.equal(disconnected, 0)
  mobile()
  assert.equal(disconnected, 1)
})

test("events during a read produce a single trailing read and never publish stale rows", async () => {
  let resolveRead, changed, reads = 0
  const store = createNotificationStore({
    load: () => { reads += 1; return reads === 1 ? new Promise((resolve) => { resolveRead = resolve }) : Promise.resolve([{ ...notification, status: "read" }]) },
    connect: (callback) => { changed = callback; return () => {} }, onError: assert.fail,
  })
  const stop = store.subscribe(() => {})
  changed(); changed(); changed()
  resolveRead([notification])
  await flush()
  assert.equal(reads, 2)
  assert.equal(store.getSnapshot()[0].status, "read")
  stop()
})

test("optimistic changes are shared and recover from a failed mutation without an intervening stale flash", async () => {
  let finishMutation, changed, errors = 0, reads = 0
  const store = createNotificationStore({
    load: async () => { reads += 1; return [notification] },
    connect: (callback) => { changed = callback; return () => {} }, onError: () => { errors += 1 },
  })
  const stop = store.subscribe(() => {})
  await flush()
  const mutation = store.mutate(() => [], () => new Promise((_, reject) => { finishMutation = reject }))
  changed()
  await flush()
  assert.equal(reads, 1)
  assert.deepEqual(store.getSnapshot(), [])
  finishMutation(new Error("connection lost"))
  await mutation
  await flush()
  assert.deepEqual(store.getSnapshot(), [notification])
  assert.equal(errors, 1)
  assert.equal(reads, 2)
  stop()
})

test("account changes clear the feed and discard late reads and events from the old connection", async () => {
  let oldRead, oldEvent, reads = 0, connections = 0
  const store = createNotificationStore({
    load: () => { reads += 1; return reads === 1 ? new Promise((resolve) => { oldRead = resolve }) : Promise.resolve([]) },
    connect: (callback) => { connections += 1; if (connections === 1) oldEvent = callback; return () => {} }, onError: assert.fail,
  })
  const stop = store.subscribe(() => {})
  store.reset()
  await flush()
  oldRead([notification]); oldEvent()
  await flush()
  assert.deepEqual(store.getSnapshot(), [])
  assert.equal(reads, 2)
  stop()
})
