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
  const desktopSnapshots = [], mobileSnapshots = []
  const desktop = store.subscribe(() => desktopSnapshots.push(store.getSnapshot()))
  const mobile = store.subscribe(() => mobileSnapshots.push(store.getSnapshot()))
  await flush()
  assert.equal(reads, 1)
  assert.equal(connections, 1)
  assert.equal(desktopSnapshots.at(-1), mobileSnapshots.at(-1))
  assert.deepEqual(desktopSnapshots.at(-1), [notification])
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

test("unread totals include notifications outside the loaded page", async () => {
  const store = createNotificationStore({ load: async () => ({ notifications: [notification], unreadCount: 37, total: 80 }), connect: () => () => {}, onError: assert.fail })
  const stop = store.subscribe(() => {})
  await flush()
  assert.equal(store.getState().unreadCount, 37)
  assert.equal(store.getState().total, 80)
  assert.equal(store.getState().loaded, true)
  let finish
  const pending = store.mutate((rows) => rows.map((row) => ({ ...row, status: "read" })), () => new Promise(resolve => { finish = resolve }))
  assert.equal(store.getState().unreadCount, 36)
  assert.equal(store.getState().pending, true)
  assert.equal(await store.mutate(() => [], async () => assert.fail("concurrent mutation started")), false)
  finish(); await pending
  stop()
})

test("a failed save rolls back even when the subsequent refresh also fails", async () => {
  let offline = false
  const store = createNotificationStore({ load: async () => { if (offline) throw Error("offline"); return [notification] }, connect: () => () => {}, onError: () => {} })
  const stop = store.subscribe(() => {})
  await flush()
  offline = true
  assert.equal(await store.mutate(() => [], async () => { throw Error("offline") }), false)
  await flush()
  assert.deepEqual(store.getSnapshot(), [notification])
  assert.equal(store.getState().unreadCount, 1)
  assert.equal(store.getState().pending, false)
  assert.ok(store.getState().error)
  offline = false
  await store.refresh()
  assert.equal(store.getState().error, null)
  stop()
})

test("initial failures remain distinguishable from an empty feed and can be retried", async () => {
  let fail = true
  const store = createNotificationStore({ load: async () => { if (fail) throw Error("offline"); return [] }, connect: () => () => {}, onError: () => {} })
  const stop = store.subscribe(() => {})
  assert.equal(store.getState().loading, true)
  await flush()
  assert.equal(store.getState().loaded, false)
  assert.ok(store.getState().error)
  fail = false
  await store.refresh()
  assert.equal(store.getState().loaded, true)
  assert.equal(store.getState().error, null)
  stop()
})

test("late failed writes from the previous account cannot restore its private feed", async () => {
  let rejectSave, account = "old"
  const store = createNotificationStore({ load: async () => account === "old" ? [notification] : [], connect: () => () => {}, onError: assert.fail })
  const stop = store.subscribe(() => {})
  await flush()
  const pending = store.mutate(() => [], () => new Promise((_, reject) => { rejectSave = reject }))
  account = "new"; store.reset()
  await flush()
  rejectSave(Error("old request failed"))
  await pending
  assert.deepEqual(store.getSnapshot(), [])
  assert.equal(store.getState().unreadCount, 0)
  assert.equal(store.getState().error, null)
  stop()
})
