import assert from "node:assert/strict"
import test from "node:test"
import { buildSync } from "esbuild"

const source = buildSync({ entryPoints: [new URL("../src/lib/customs-calculation-history-request.ts", import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
const module = { exports: {} }
new Function("module", "exports", source)(module, module.exports)
const { readCalculationHistoryAtRevision } = module.exports

test("a late response cannot replace history invalidated by a confirmed write", async () => {
  let revision = 0, resolveOld
  const old = readCalculationHistoryAtRevision(() => new Promise(resolve => { resolveOld = resolve }), () => revision)
  revision++
  const latest = { history: [{ id: "new-calculation" }] }
  assert.equal(await readCalculationHistoryAtRevision(async () => latest, () => revision), latest)
  resolveOld({ history: [{ id: "old-calculation" }] })
  assert.equal(await old, null)
})

test("an unchanged revision preserves the exact response without rewriting history", async () => {
  const history = Object.freeze({ history: Object.freeze([{ id: "saved" }]) })
  assert.equal(await readCalculationHistoryAtRevision(async () => history, () => 3), history)
})

test("failed reads remain recoverable errors and are not silently retried", async () => {
  let calls = 0
  const failure = new Error("History unavailable")
  await assert.rejects(readCalculationHistoryAtRevision(async () => { calls++; throw failure }, () => 0), error => error === failure)
  assert.equal(calls, 1)
})
