import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import test from "node:test"
import ts from "typescript"
import { createQuoteSaveQueue } from "../src/lib/quote-save-queue.ts"

// Execute the real subscription adapter with controlled Auth/Realtime
// transports, so token renewal and late events are deterministic.
function setup() {
  const channels = []
  const published = []
  let accessRevision = 0
  let reads = 0
  let resolveRead
  const events = new EventTarget()
  const client = {
    channel(name) {
      const channel = { name, removed: false,
        on(_event, _filter, callback) { this.emit = callback; return this },
        subscribe() { channels.push(this); return this },
      }
      return channel
    },
    removeChannel(channel) { channel.removed = true; return Promise.resolve() },
    from() { return { select() { return this }, eq() { return this }, maybeSingle() {
      reads += 1
      return new Promise((resolve) => { resolveRead = resolve })
    } } },
  }
  const modules = {
    "@/lib/supabase": { supabase: client, supabaseFunctionsUrl: "https://project.test/functions/v1", authenticatedAccessChangedEvent: "access", getSupabaseSession: async () => ({ user: { id: "operator" } }) },
    "@/lib/application-data-api": { invalidateRegisterPages() {} },
    "@/lib/crm-read-cache": { captureAuthenticatedScope: () => {
      const captured = accessRevision
      return () => { if (captured !== accessRevision) throw new Error("revoked") }
    } },
    "@/lib/quote-intelligence-snapshot": { intelligenceFromRealtimeRow: (row) => row.snapshot ?? null },
    "@/lib/quote-save-queue": { createQuoteSaveQueue },
  }
  const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/quote-workflow-api.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  runInNewContext(compiled, { exports, require: (name) => {
    assert.ok(modules[name], `Unexpected dependency: ${name}`)
    return modules[name]
  }, window: events, setTimeout, clearTimeout })
  const stop = exports.subscribeQuoteIntelligence("quote", (next) => published.push(next))
  const row = (n) => ({ eventType: "UPDATE", new: { CusQuoteIntelligence_QuoteID: "quote", CusQuoteIntelligence_UpdatedAt: `2026-09-03T00:00:0${n}Z`, snapshot: { calculatedAt: `2026-09-03T00:00:0${n}Z`, n } } })
  return { channels, published, stop, row, reads: () => reads,
    resolveRead: (snapshot) => resolveRead({ data: { snapshot }, error: null }),
    renew() { accessRevision += 1; events.dispatchEvent(new Event("access")) },
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

test("valid realtime updates require no read and reject older evidence", async () => {
  const env = setup()
  await tick()
  env.channels[0].emit(env.row(2))
  env.channels[0].emit(env.row(1))
  assert.deepEqual(env.published.map((x) => x.n), [2])
  assert.equal(env.reads(), 0)
  env.stop()
  env.channels[0].emit(env.row(3))
  assert.equal(env.published.length, 1)
})

test("token renewal reconnects once and rejects the old channel", async () => {
  const env = setup()
  await tick()
  env.renew()
  env.renew()
  env.channels[0].emit(env.row(1))
  await tick()
  assert.equal(env.channels.length, 2)
  assert.equal(env.channels[0].removed, true)
  assert.notEqual(env.channels[0].name, env.channels[1].name)
  env.channels[0].emit(env.row(2))
  env.channels[1].emit(env.row(3))
  assert.deepEqual(env.published.map((x) => x.n), [3])
  env.stop()
})

test("partial events share one recovery read and cannot overwrite a newer full event", async () => {
  const env = setup()
  await tick()
  const partial = { eventType: "UPDATE", new: { CusQuoteIntelligence_QuoteID: "quote" } }
  env.channels[0].emit(partial)
  env.channels[0].emit(partial)
  assert.equal(env.reads(), 1)
  env.channels[0].emit(env.row(3))
  env.resolveRead({ n: 1 })
  await tick()
  assert.deepEqual(env.published.map((x) => x.n), [3])
  env.stop()
})
