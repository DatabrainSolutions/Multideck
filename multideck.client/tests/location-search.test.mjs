import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = readFileSync(new URL("../src/lib/location-search.ts", import.meta.url), "utf8")
const create = new Function("edgeFetch", "getSupabaseSession", `${stripTypeScriptTypes(source.replace(/^import .*\n/gm, "")).replace(/export /g, "")}; return searchLocations`)

test("repeat queries reuse results across forms but never across users", async () => {
  let user = "first", calls = 0
  const search = create(async () => { calls++; return Response.json({ items: [{ id: String(calls), label: "Leeds" }] }) }, async () => ({ user: { id: user }, access_token: "test-only" }))
  const signal = new AbortController().signal
  const first = await search("Leeds", signal)
  assert.deepEqual(await search(" leeds ", signal), first)
  assert.equal(calls, 1)
  user = "second"
  assert.notDeepEqual(await search("Leeds", signal), first)
  assert.equal(calls, 2)
})

test("failed and cancelled requests do not become cached successes", async () => {
  let fail = true, calls = 0
  const search = create(async () => { calls++; return Response.json(fail ? { detail: "Search unavailable" } : { items: [] }, { status: fail ? 503 : 200 }) }, async () => ({ user: { id: "user" }, access_token: "test-only" }))
  const signal = new AbortController().signal
  await assert.rejects(search("Leeds", signal), /Search unavailable/)
  fail = false
  assert.deepEqual(await search("Leeds", signal), [])
  assert.equal(calls, 2)
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(search("Leeds", aborted.signal), { name: "AbortError" })
  assert.equal(calls, 2)
})

test("a missing session cannot read even public cached results", async () => {
  let signedIn = true
  const search = create(async () => Response.json({ items: [] }), async () => signedIn ? ({ user: { id: "user" }, access_token: "test-only" }) : null)
  const signal = new AbortController().signal
  await search("Leeds", signal)
  signedIn = false
  await assert.rejects(search("Leeds", signal), /Sign in again/)
})
