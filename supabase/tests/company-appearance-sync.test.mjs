import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = await readFile(new URL("../../multideck.client/src/lib/company-appearance-sync.ts", import.meta.url), "utf8")
const javascript = stripTypeScriptTypes(source, { mode: "strip" })
const { watchCompanyAppearanceReset } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`)
const tick = () => new Promise((resolve) => setImmediate(resolve))

function fixture({ selected = "company", saved = "teal", error = null, afterPendingSaves = async () => {} } = {}) {
  globalThis.window = new EventTarget()
  globalThis.document = new EventTarget()
  document.visibilityState = "visible"
  let onChange, onStatus, filter, stopped = false, resets = 0, brandReads = 0, profileReads = 0
  const channel = {
    on(_event, options, callback) { filter = options; onChange = callback; return this },
    subscribe(callback) { onStatus = callback; return this },
  }
  const client = {
    channel: () => channel,
    removeChannel: async () => { stopped = true },
    rpc: async (name) => {
      assert.equal(name, "get_current_user_accent_preference")
      profileReads++
      return { data: [{ accent_preset: saved }], error }
    },
  }
  const stop = watchCompanyAppearanceReset(client, "auth-user-a", {
    isCompanySelected: () => selected === "company",
    afterPendingSaves,
    onReset: () => { resets++; selected = "teal" },
    refreshBrand: async () => { brandReads++ },
  })
  return {
    stop,
    change: () => onChange({ new: { User_AccentPreset: "teal" } }),
    reconnect: () => onStatus("SUBSCRIBED"),
    choose: (value) => { selected = value },
    result: () => ({ selected, resets, brandReads, profileReads, stopped, filter }),
  }
}

test("an open company-theme session follows the authenticated profile reset", async () => {
  const f = fixture()
  f.change()
  await tick()
  assert.equal(f.result().selected, "teal")
  assert.equal(f.result().resets, 1)
  assert.equal(f.result().brandReads, 1)
  assert.equal(f.result().filter.filter, "Auth_User_ID=eq.auth-user-a")
  f.stop()
})

test("other personal presets remain untouched and make no refresh requests", async () => {
  const f = fixture({ selected: "violet" })
  f.change(); f.reconnect()
  await tick()
  assert.equal(f.result().selected, "violet")
  assert.equal(f.result().profileReads, 0)
  f.stop()
})

test("failed reads do not masquerade as brand removal", async () => {
  const f = fixture({ error: new Error("Offline") })
  f.change()
  await tick()
  assert.equal(f.result().resets, 0)
  assert.equal(f.result().brandReads, 0)
  f.stop()
})

test("focus and reconnect recover a reset missed while offline", async () => {
  for (const action of [() => window.dispatchEvent(new Event("focus")), (f) => f.reconnect()]) {
    const f = fixture()
    action(f)
    await tick()
    assert.equal(f.result().selected, "teal")
    f.stop()
  }
})

test("a later deliberate choice wins over a delayed reset signal", async () => {
  let release
  const f = fixture({ afterPendingSaves: () => new Promise((resolve) => { release = resolve }) })
  f.change()
  f.choose("violet")
  release()
  await tick()
  assert.equal(f.result().selected, "violet")
  assert.equal(f.result().profileReads, 0)
  f.stop()
})

test("sign-out cleanup cancels queued work and unregisters listeners", async () => {
  let release
  const f = fixture({ afterPendingSaves: () => new Promise((resolve) => { release = resolve }) })
  f.change()
  f.stop()
  release()
  window.dispatchEvent(new Event("focus"))
  await tick()
  assert.equal(f.result().stopped, true)
  assert.equal(f.result().resets, 0)
  assert.equal(f.result().profileReads, 0)
})
