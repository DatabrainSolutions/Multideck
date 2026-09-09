import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")
const api = read("lib/application-data-api.ts")
const page = read("pages/road-control-page.tsx")
const booking = read("components/multideck/booking-components.tsx")

// Execute the real mapper and route helper without starting Auth or a backend.
function functionSource(source, name) {
  const file = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declaration = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.ok(declaration, `Missing production function ${name}`)
  return declaration.getText(file).replace(/^export /, "")
}
const context = vm.createContext({ tone: (value) => value })
const code = [functionSource(api, "roadStage"), functionSource(api, "toDomesticRoadJob"), functionSource(booking, "getBookingDetailPath")].join("\n")
vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)

test("Road identities preserve distinct full Booking references, including equal numeric suffixes", () => {
  const refs = ["JI0991134", "JE0991134", "JE1991134", "JD0000049"]
  const jobs = refs.map((reference) => context.toDomesticRoadJob({ Booking_Reference: reference, Progress: 45 }))
  assert.deepEqual(jobs.map((job) => job.id), refs)
  assert.equal(new Set(jobs.map((job) => job.id)).size, refs.length)
  for (const job of jobs) {
    assert.equal(job.bookingId, job.id)
    assert.equal(job.stage, "ready")
  }
})

test("both Road list and Kanban callbacks open the exact canonical Booking", () => {
  const callbacks = [...page.matchAll(/onOpenBooking=\{([^}]+)\}/g)].map((match) => match[1])
  assert.equal(callbacks.length, 2)
  for (const reference of ["JE0991134", "JI0991134", "JD0000049", "custom/ref ?#"]) {
    const job = { id: "deliberately-not-the-booking-reference", bookingId: reference }
    for (const callback of callbacks) {
      const destinations = []
      const run = vm.runInNewContext(`(${callback})`, { job, navigate: (path) => destinations.push(path), getBookingDetailPath: context.getBookingDetailPath })
      run(job)
      assert.deepEqual(destinations, [`/bookings/${encodeURIComponent(reference.toLowerCase())}`])
    }
  }
})
