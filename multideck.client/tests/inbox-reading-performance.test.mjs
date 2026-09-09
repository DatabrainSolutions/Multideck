import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const workspace = await readFile(new URL("../src/lib/inbox-workspace.tsx", import.meta.url), "utf8")
const api = await readFile(new URL("../src/lib/inbox-api.ts", import.meta.url), "utf8")
const detailCallbacks = workspace.slice(workspace.indexOf("  const readThreadDetail ="), workspace.indexOf("  // Resolve URL state"))
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const detail = (id = "thread", messages = []) => ({ id, mailboxId: "mailbox", messages, unreadCount: 0, readOnly: false, summary: {}, hasOlderMessages: false })

function fixture() {
  const reads = []
  const imageReads = []
  const deps = {
    useCallback: (callback) => callback,
    threadDetailCacheTtlMs: 60_000,
    threadDetailCacheLimit: 48,
    accountScopeRef: { current: "account-a" },
    threadDetailsRef: { current: new Map() },
    threadDetailRequestsRef: { current: new Map() },
    olderThreadRequestsRef: { current: new Map() },
    getThread: (id, options) => { const pending = deferred(); reads.push({ id, options, ...pending }); return pending.promise },
    prefetchThreadInlineAttachmentBlobUrls: (value) => { imageReads.push(value); return new Promise(() => {}) },
  }
  const methods = new Function(...Object.keys(deps), `${stripTypeScriptTypes(detailCallbacks, { mode: "strip" })}; return { fetchThreadDetail, readThreadDetail, rememberThreadDetail, fetchOlderThreadMessages }`)(...Object.values(deps))
  return { ...methods, ...deps, reads, imageReads }
}

test("message text resolves while image downloads are still pending", async () => {
  const f = fixture()
  const request = f.fetchThreadDetail("thread")
  f.reads[0].resolve(detail())
  assert.equal((await request).id, "thread")
  assert.equal(f.imageReads.length, 1)
  assert.equal(f.readThreadDetail("thread").id, "thread")
})

test("selection and forced refresh share one in-flight thread request", async () => {
  const f = fixture()
  const first = f.fetchThreadDetail("thread")
  const forced = f.fetchThreadDetail("thread", true)
  assert.equal(f.reads.length, 1)
  f.reads[0].resolve(detail())
  assert.equal(await first, await forced)
  await f.fetchThreadDetail("thread")
  assert.equal(f.reads.length, 1)
})

test("an old account request cannot repopulate the cache or remove its replacement", async () => {
  const f = fixture()
  const old = f.fetchThreadDetail("thread")
  f.accountScopeRef.current = "account-b"
  f.threadDetailRequestsRef.current.clear()
  const replacement = f.fetchThreadDetail("thread")
  f.reads[0].resolve(detail())
  await assert.rejects(old, /workspace changed/)
  assert.equal(f.threadDetailsRef.current.size, 0)
  assert.equal(f.imageReads.length, 0)
  assert.equal(f.threadDetailRequestsRef.current.size, 1)
  f.reads[1].resolve(detail())
  await replacement
  assert.equal(f.threadDetailsRef.current.size, 1)
})

test("failed thread fetches release their slot and can be retried", async () => {
  const f = fixture()
  const failed = f.fetchThreadDetail("thread")
  f.reads[0].reject(new Error("Offline"))
  await assert.rejects(failed, /Offline/)
  assert.equal(f.threadDetailRequestsRef.current.size, 0)
  const retry = f.fetchThreadDetail("thread")
  f.reads[1].resolve(detail())
  await retry
})

test("reading older messages preserves the full thread without downloading collapsed images", async () => {
  const f = fixture()
  f.rememberThreadDetail(detail("thread", [{ id: "new" }]))
  const older = f.fetchOlderThreadMessages("thread", 1)
  f.reads[0].resolve(detail("thread", [{ id: "old" }]))
  assert.deepEqual((await older).messages.map(m => m.id), ["old", "new"])
  assert.equal(f.imageReads.length, 0)
})

test("thread memory is bounded and expired records must be refreshed", () => {
  const f = fixture()
  for (let i = 0; i < 60; i++) f.rememberThreadDetail(detail(String(i)))
  assert.equal(f.threadDetailsRef.current.size, 48)
  assert.equal(f.readThreadDetail("0"), null)
  f.threadDetailsRef.current.get("59").cachedAt = Date.now() - 61_000
  assert.equal(f.readThreadDetail("59"), null)
})

test("image prefetch downloads only distinct images from the newest message, capped at 24", async () => {
  const source = api.slice(api.indexOf("export async function prefetchThreadInlineAttachmentBlobUrls"), api.indexOf("/** Clears private image material"))
  const ids = []
  const prefetch = new Function("loadInlineAttachmentBlobUrl", `${stripTypeScriptTypes(source.replace("export ", ""), { mode: "strip" })}; return prefetchThreadInlineAttachmentBlobUrls`)(async id => ids.push(id))
  const image = (id) => ({ id, isInline: true, contentId: id })
  await prefetch(detail("thread", [
    { attachments: [image("collapsed")] },
    { attachments: [image("visible"), image("visible"), { id: "download", isInline: false }, ...Array.from({ length: 30 }, (_, i) => image(String(i)))] },
  ]))
  assert.equal(ids.length, 24)
  assert.equal(ids.includes("collapsed"), false)
  assert.equal(ids.includes("download"), false)
  assert.equal(ids.filter(id => id === "visible").length, 1)
})
