import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("../src/pages/booking-open-page.tsx", import.meta.url), "utf8")
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const functions = ast.statements.filter(ts.isFunctionDeclaration).map(node => node.getText(ast).replace(/^export /, "")).join("\n")
const compiled = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
const flush = () => new Promise(resolve => setImmediate(resolve))

// Execute production effects/handlers with explicit hook and transport fixtures.
// This is not a rendered browser, managed Auth or database persistence test.
function fixture(initialMode = "road", storageFailure = false) {
  const states = [], refs = [], requests = [], destinations = [], storage = new Map()
  let stateIndex = 0, refIndex = 0, effect
  const context = vm.createContext({
    Promise, Error,
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    Button: "button", Surface: "surface", DotGridLoader: "loader",
    workspaceStorageKey: key => `tenant:${key}`,
    useLanguage: () => ({ t: value => value }),
    useRef: initial => refs[refIndex++] ??= { current: initial },
    useState: initial => {
      const index = stateIndex++
      if (!(index in states)) states[index] = initial
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value }]
    },
    useEffect: callback => { effect = callback },
    crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    window: { sessionStorage: {
      getItem: key => { if (storageFailure) throw new Error("Storage unavailable"); return storage.get(key) ?? null },
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
    } },
    openBookingWorkflow: (key, mode) => new Promise((resolve, reject) => requests.push({ key, mode, resolve, reject })),
  })
  vm.runInContext(compiled, context)
  const render = () => { stateIndex = 0; refIndex = 0; return context.BookingOpenPage({ initialMode, navigate: value => destinations.push(value) }) }
  return { render, commit: () => effect(), requests, destinations, storage, states }
}
function findButton(tree, label) {
  if (!tree || typeof tree !== "object") return null
  if (tree.type === "button" && tree.children.includes(label)) return tree
  for (const child of tree.children ?? []) { const result = findButton(child, label); if (result) return result }
  return null
}

test("Strict Mode effect replay makes one Road request and one live navigation", async () => {
  const f = fixture()
  f.render(); f.commit()()
  f.render(); f.commit()
  await flush()
  assert.equal(f.requests.length, 1)
  assert.equal(f.requests[0].mode, "road")
  assert.ok([...f.storage.keys()][0].endsWith(".road"))
  f.requests[0].resolve({ bookingReference: "JD00001" })
  await flush()
  assert.deepEqual(f.destinations, ["/bookings/jd00001"])
  assert.equal(f.storage.size, 0)
})

test("leaving creation suppresses late navigation and retains the retry key", async () => {
  const f = fixture()
  f.render(); const cleanup = f.commit()
  await flush(); cleanup()
  f.requests[0].resolve({ bookingReference: "JD00001" })
  await flush()
  assert.deepEqual(f.destinations, [])
  assert.equal(f.storage.size, 1)
})

test("failed Road opening keeps its idempotency key for explicit retry", async () => {
  const f = fixture()
  f.render(); f.commit(); await flush()
  f.requests[0].reject(new Error("Denied or unavailable")); await flush()
  assert.equal(f.states[0], "Denied or unavailable")
  assert.deepEqual(f.destinations, [])
  const tree = f.render()
  assert.ok(findButton(tree, "Return to Road control"))
  findButton(tree, "Try again").props.onClick()
  f.render(); f.commit(); await flush()
  assert.equal(f.requests.length, 2)
  assert.equal(f.requests[0].key, f.requests[1].key)
  f.requests[1].resolve({ bookingReference: "JD00001" }); await flush()
  assert.deepEqual(f.destinations, ["/bookings/jd00001"])
})

test("storage failure is recoverable and makes no backend request", async () => {
  const f = fixture("road", true)
  f.render(); f.commit(); await flush()
  assert.equal(f.states[0], "Storage unavailable")
  assert.equal(f.requests.length, 0)
  assert.ok(findButton(f.render(), "Try again"))
})

test("generic Booking opening retains its separate request scope", async () => {
  const f = fixture(null)
  f.render(); f.commit(); await flush()
  assert.equal(f.requests.length, 1)
  assert.ok([...f.storage.keys()][0].endsWith("open-request"))
  f.requests[0].resolve({ bookingReference: "JX00001" }); await flush()
  assert.deepEqual(f.destinations, ["/bookings/jx00001"])
})

test("the real API chooses only the explicit Road opener or unchanged generic opener", () => {
  const api = readFileSync(new URL("../src/lib/booking-workflow-api.ts", import.meta.url), "utf8")
  const file = ts.createSourceFile("api.ts", api, ts.ScriptTarget.Latest, true)
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "openBookingWorkflow")
  const requests = []
  const context = vm.createContext({ invoke: body => requests.push(body) })
  vm.runInContext(ts.transpileModule(fn.getText(file).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  context.openBookingWorkflow("generic-key")
  context.openBookingWorkflow("road-key", "road")
  assert.deepEqual(requests.map(body => [body.action, body.idempotencyKey, body.sequenceKey]), [
    ["open", "generic-key", "default"], ["open-road", "road-key", "default"],
  ])
})

test("legacy Road links cannot render sample details or implicitly open a draft", () => {
  const page = readFileSync(new URL("../src/pages/domestic-road-booking-page.tsx", import.meta.url), "utf8")
  const file = ts.createSourceFile("road.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const fn = file.statements.find(ts.isFunctionDeclaration)
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    Button: "button", Surface: "surface", BookingOpenPage: "open-page", useLanguage: () => ({ t: value => value }),
  })
  vm.runInContext(ts.transpileModule(fn.getText(file).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context)
  const destinations = []
  const navigate = value => destinations.push(value)
  const legacy = context.DomesticRoadBookingPage({ navigate, roadJobId: "RD-91134" })
  assert.ok(JSON.stringify(legacy).includes("does not contain a complete Booking reference"))
  assert.ok(!JSON.stringify(legacy).includes('"open-page"'))
  findButton(legacy, "Return to Road control").props.onClick()
  assert.deepEqual(destinations, ["/road-control"])
  const create = context.DomesticRoadBookingPage({ navigate })
  assert.equal(create.type, "open-page")
  assert.equal(create.props.initialMode, "road")
})
