import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import vm from "node:vm"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")
const catalogue = JSON.parse(await read("supabase/functions/_shared/template-preview-catalogue.json"))
const ts = createRequire(new URL("multideck.client/package.json", root))("typescript")
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const safetyCode = (await read("supabase/functions/_shared/template-preview-safety.ts"))
  .replace(/^import .*\n/, "").replaceAll("export ", "")
const safety = vm.createContext({ catalogue, structuredClone })
vm.runInContext(ts.transpile(safetyCode, { target: ts.ScriptTarget.ES2022 }), safety)

test("reviewed fingerprints match the exact retained source files", async () => {
  assert.equal(Object.keys(catalogue).length, 44)
  for (const [hash, entry] of Object.entries(catalogue)) {
    const source = await readFile(new URL(entry.source, root))
    assert.equal(digest(source), hash, entry.source)
    assert.ok(safety.templatePreviewSample(hash), entry.source)
    const changed = Buffer.concat([source, Buffer.from("changed")])
    assert.equal(safety.templatePreviewSample(digest(changed)), null)
  }
})

test("completed customer PDF, unknown sources and inherited object keys fail closed", () => {
  for (const hash of ["49da9d563b46fb26dff7336c102b80e6fe43bb327cb4de23dedbc842b5405e01", "829546d1c17df2f4514835ea4b0bfbb254856f8d2e4ec08b398f3fceb8a5f1fc", "0ee1a53cfd17410fe4fa260d4eae7bf75ea29181cefaca53ddda74e9a5c7fb09", "unknown", "constructor", "__proto__"]) {
    assert.equal(safety.templatePreviewSample(hash), null)
  }
})

test("all three restored waybills have reviewed fictional fixtures and their retained sources stay blocked", () => {
  const restored = Object.entries(catalogue).filter(([, entry]) => entry.source.includes("demo-safe-waybills/") && entry.source.endsWith("_demo_safe.docx"))
  assert.equal(restored.length, 3)
  for (const [hash, entry] of restored) {
    const fixture = safety.templatePreviewSample(hash)
    assert.match(JSON.stringify(fixture), /DEMO-/)
    assert.doesNotMatch(JSON.stringify(fixture), /FISH4PETS|GOOD SMILE|JE2648771|LPL1531517|Charlotte Bucknell|YESILKOY|MNG AIRLINES/)
    if (entry.source.includes("FIATA")) assert.match(fixture.company.logoDataUri, /^data:image\/png;base64,/)
    else assert.equal(fixture.routing[0].carrierName, "Example Demo Airlines")
  }
})

test("Booking transport previews retain full fictional schedules and never include issue or security assertions", () => {
  const drafts = Object.entries(catalogue).filter(([, entry]) => entry.source.endsWith("_booking_draft.docx"))
  assert.equal(drafts.length, 4)
  for (const [hash] of drafts) {
    const fixture = safety.templatePreviewSample(hash)
    assert.equal(fixture.transport.cargo.length, 2)
    assert.equal(fixture.transport.equipment.length, 2)
    assert.equal(fixture.transport.allocations.length, 3)
    assert.equal(fixture.transport.allocations[1].packages, "22")
    assert.equal(fixture.transport.allocations[1].grossWeight, "")
    assert.equal(fixture.documentIssue.status, "draft")
    assert.equal(fixture.documentIssue.isLegalOriginal, false)
    assert.equal(fixture.transport.securityStatus, "")
    assert.equal(fixture.waybill.onBoardDate, "")
    assert.doesNotMatch(JSON.stringify(fixture), /FISH4PETS|GOOD SMILE|JE2648771|LPL1531517|Charlotte Bucknell|YESILKOY|MNG AIRLINES/)
  }
})

test("each fixture is independent and cannot be changed by another preview", () => {
  const hash = Object.keys(catalogue)[0]
  const fixture = safety.templatePreviewSample(hash)
  fixture.customer = { name: "Private customer should never persist" }
  assert.notEqual(safety.templatePreviewSample(hash).customer?.name, fixture.customer.name)
})

test("actual preview handler blocks unreviewed bytes before Carbone and ignores caller data", async () => {
  const edge = await read("supabase/functions/document-studio/index.ts")
  const start = edge.indexOf('    if (payload.action === "preview-draft") {')
  const end = edge.indexOf("    const templateCode = parseTemplateCode", start)
  const branch = edge.slice(start, end)
  const events = []
  const requests = []
  class FunctionError extends Error { constructor(status, message) { super(message); this.status = status } }
  const context = vm.createContext({
    FunctionError, context: {}, request: {},
    isUuid: () => true,
    authorizeTemplateSave: async () => { events.push("authorised") },
    fromBase64: (value) => Buffer.from(value, "base64"),
    sha256Hex: async (bytes) => digest(bytes),
    templatePreviewSample: safety.templatePreviewSample,
    templatePreviewPrivacyMessage: "Preview hidden for privacy",
    AbortController, setTimeout, clearTimeout, DOMException, TextDecoder, Uint8Array,
    renderTimeout: () => 1000,
    getCarboneBaseUrl: () => "https://example.invalid",
    getCarboneAuthorization: () => "fictional-test-token",
    Deno: { env: { get: () => undefined } },
    maximumGeneratedFileBytes: 50 * 1024 * 1024,
    fetch: async (_url, options) => {
      events.push("rendered")
      requests.push(JSON.parse(options.body))
      return { ok: true, headers: new Headers(), arrayBuffer: async () => Uint8Array.from(Buffer.from("%PDF-fictional")).buffer }
    },
    binaryResponse: (_request, bytes) => bytes,
  })
  vm.runInContext(ts.transpile(`async function preview(payload) { ${branch} }`, { target: ts.ScriptTarget.ES2022 }), context)
  await assert.rejects(context.preview({ action: "preview-draft", multideckTemplateId: "test", templateBase64: Buffer.from("%PDF-customer").toString("base64") }), { status: 400 })
  assert.deepEqual(events, ["authorised"])
  const [hash, entry] = Object.entries(catalogue)[0]
  const bytes = await readFile(new URL(entry.source, root))
  await context.preview({ action: "preview-draft", multideckTemplateId: "test", templateBase64: bytes.toString("base64"), templateFileName: "source.docx", sampleData: { customer: { name: "PRIVATE CUSTOMER", email: "private@example.invalid" } } })
  assert.deepEqual(events, ["authorised", "authorised", "rendered"])
  assert.deepEqual(requests[0].data, catalogue[hash].sampleData)
  assert.doesNotMatch(JSON.stringify(requests[0]), /PRIVATE CUSTOMER|private@example.invalid/)
})

test("template editor cannot accept arbitrary customer JSON or publish blocked previews", async () => {
  const page = await read("multideck.client/src/pages/documents-page.tsx")
  assert.match(page, /<textarea value=\{draftSampleJson\} readOnly/)
  assert.match(page, /!sourcePreviewSafe \|\| publishingSource/)
  assert.match(page, /setSourcePreviewSafe\(false\)/)
  assert.match(page, /requestId === previewRequestRef\.current/)
  assert.match(page, /disabled=\{!canManageTemplates \|\| !draftPreviewUrl/)
})
