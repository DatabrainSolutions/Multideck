import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(new URL("../package.json", import.meta.url))
const ts = require("typescript")
const source = await readFile(new URL("../src/components/multideck/inbox-suggested-updates-workspace.tsx", import.meta.url), "utf8")
const compile = (text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const handler = source.slice(source.indexOf("  async function dismissSuggestion("), source.indexOf("  async function attachSelected("))
const membership = { id: "ec", status: "needs_match", sourceFileName: "invoice_EC.pdf" }
const freight = { id: "freight", status: "ready", sourceFileName: "freight.pdf" }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function harness(request, busy = null) {
  const calls = { dismissed: [], success: [], errors: [], busy: [], reloads: 0, focuses: 0 }
  let suggestions = [membership, freight]
  const version = { current: 1 }
  const dependencies = {
    busySuggestionId: busy,
    dismissInFlight: { current: false },
    setBusySuggestionId: (id) => calls.busy.push(id),
    dismissInboxSuggestedUpdate: (id) => { calls.dismissed.push(id); return request(id) },
    loadVersion: version,
    setSuggestions: (update) => { suggestions = update(suggestions) },
    toast: { success: (...args) => calls.success.push(args), error: (message) => calls.errors.push(message) },
    t: (text) => text,
    reviewTabRef: { current: { focus: () => calls.focuses++ } },
    load: async () => { calls.reloads++ },
    errorText: (error, fallback) => error.message || fallback,
  }
  const dismiss = new Function(...Object.keys(dependencies), `${compile(handler)}\nreturn dismissSuggestion;`)(...Object.values(dependencies))
  return { dismiss, calls, version, suggestions: () => suggestions }
}

test("delete targets the clicked suggestion, not the currently selected freight document", async () => {
  const h = harness(async () => {})
  await h.dismiss(membership)
  assert.deepEqual(h.calls.dismissed, ["ec"])
  assert.equal(h.suggestions()[0].status, "dismissed")
  assert.equal(h.suggestions()[1].status, "ready")
  assert.equal(h.calls.focuses, 1)
  assert.equal(h.calls.success[0][1].description, "Kept in History. The source email and attachment are unchanged.")
})

test("a pending or failed request never hides a suggestion or reports success", async () => {
  const request = deferred()
  const h = harness(() => request.promise)
  const pending = h.dismiss(membership)
  assert.equal(h.suggestions()[0].status, "needs_match")
  assert.equal(h.calls.success.length, 0)
  request.reject(new Error("Connection lost"))
  await pending
  assert.equal(h.suggestions()[0].status, "needs_match")
  assert.deepEqual(h.calls.errors, ["Connection lost"])
  assert.equal(h.calls.success.length, 0)
  assert.equal(h.calls.reloads, 0)
  assert.equal(h.calls.busy.at(-1), null)
})

test("stress: 100 rapid presses produce one server dismissal", async () => {
  const request = deferred()
  const h = harness(() => request.promise)
  const presses = Array.from({ length: 100 }, () => h.dismiss(membership))
  assert.deepEqual(h.calls.dismissed, ["ec"])
  request.resolve()
  await Promise.all(presses)
  assert.equal(h.calls.success.length, 1)
  assert.equal(h.calls.reloads, 1)
})

test("applied, dismissed, applying and busy suggestions cannot be deleted", async () => {
  for (const status of ["applied", "dismissed", "applying", "failed", "superseded"]) {
    const h = harness(async () => {})
    await h.dismiss({ ...membership, status })
    assert.deepEqual(h.calls.dismissed, [])
  }
  const h = harness(async () => {}, "freight")
  await h.dismiss(membership)
  assert.deepEqual(h.calls.dismissed, [])
})

test("an older list response cannot restore a suggestion after deletion or a newer refresh", async () => {
  const start = source.indexOf("const load = useCallback(") + "const load = useCallback(".length
  const end = source.indexOf(", [t])", start)
  const requests = [deferred(), deferred()]
  const version = { current: 0 }
  let index = 0, suggestions = [], selected = null
  const dependencies = {
    loadVersion: version, setState: () => {}, setError: () => {}, t: (text) => text,
    listInboxSuggestedUpdates: () => requests[index++].promise,
    loadInboxSuggestionSettings: async () => [],
    setSuggestions: (next) => { suggestions = next }, setSettings: () => {},
    setSelectedId: (update) => { selected = update(selected) },
    errorText: (error) => error.message,
  }
  const load = new Function(...Object.keys(dependencies), `${compile(`const load = ${source.slice(start, end)};`)}\nreturn load;`)(...Object.values(dependencies))
  const stale = load()
  version.current++ // confirmed dismissal invalidates in-flight reads
  const fresh = load(true)
  requests[1].resolve([freight])
  await fresh
  requests[0].resolve([membership, freight])
  await stale
  assert.deepEqual(suggestions, [freight])
})

test("row controls are separate buttons, named, touch-sized and disabled during a mutation", () => {
  assert.match(source, /<motion\.div key=\{suggestion\.id\}/)
  assert.doesNotMatch(source, /<motion\.button key=\{suggestion\.id\}/)
  assert.match(source, /aria-label=\{`\$\{t\("Delete suggestion for"\)\} \$\{suggestion\.sourceFileName\}`\}/)
  assert.match(source, /size-10[^\n]+disabled=\{busySuggestionId !== null\}/)
  assert.match(source, /onClick=\{\(\) => void dismissSuggestion\(suggestion\)\}/)
})
