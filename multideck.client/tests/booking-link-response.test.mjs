import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

const source = await readFile(new URL("../src/lib/booking-link-response.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { normaliseBookingLink } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)
const legacy = Object.freeze({ id: "legacy-link", title: "Discovery call", path: "/book/owner/discovery", durationMinutes: 30, provider: "multideck", questions: [] })

test("legacy links without kind or hosts remain readable and editable", () => {
  const link = normaliseBookingLink(legacy)
  assert.equal(link.kind, "one_on_one")
  assert.deepEqual(link.hosts, [])
  assert.deepEqual(link.hosts.map(host => host.userId), [])
  assert.equal(link.title, legacy.title)
  assert.equal(link.path, legacy.path)
  assert.equal(legacy.kind, undefined)
})

test("null legacy fields receive the same backwards-compatible defaults", () => {
  assert.deepEqual(normaliseBookingLink({ ...legacy, kind: null, hosts: null }), { ...legacy, kind: "one_on_one", hosts: [] })
})

test("all supported booking policies and host identities are preserved", () => {
  const hosts = [{ userId: "host-1", name: "Alex Smith", email: "alex@example.test" }]
  for (const kind of ["one_on_one", "round_robin", "collective"]) {
    const link = normaliseBookingLink({ ...legacy, kind, hosts })
    assert.equal(link.kind, kind)
    assert.deepEqual(link.hosts, hosts)
    assert.deepEqual(normaliseBookingLink(link), link)
  }
})

test("unsupported policies fail clearly rather than being relabelled one-to-one", () => {
  for (const kind of ["", "new_policy", "constructor", "__proto__", 123, {}]) {
    assert.throws(() => normaliseBookingLink({ ...legacy, kind }), /unsupported booking type/)
  }
})

test("shared kinds with missing host arrays do not crash the list or edit drawer", () => {
  for (const hosts of [undefined, null]) {
    const link = normaliseBookingLink({ ...legacy, kind: "collective", hosts })
    assert.equal(link.kind, "collective")
    assert.equal(link.hosts.length, 0)
    assert.deepEqual(link.hosts.map(host => host.userId), [])
  }
})

test("workspace, create and update responses all use the normaliser", async () => {
  const api = await readFile(new URL("../src/lib/calendar-api.ts", import.meta.url), "utf8")
  assert.equal((api.match(/workspace\.bookingLinks\.map\(normaliseBookingLink\)/g) ?? []).length, 2)
  for (const name of ["createBookingLink", "updateBookingLink"]) {
    const body = api.slice(api.indexOf(`export async function ${name}(`)).split("\n}\n")[0]
    assert.equal((body.match(/return normaliseBookingLink\(/g) ?? []).length, 2)
  }
})
