import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/components/multideck/document-workspace.tsx", import.meta.url), "utf8")
const body = source.split("  async function downloadPdf() {")[1].split("\n  const dateFormatter")[0].trim().replace(/\}$/, "")
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

async function run(response) {
  const state = { busy: [], errors: [], clicked: false, filename: null }
  const link = { click() { state.clicked = true }, remove() {} }
  const action = new AsyncFunction("pdfUrl", "downloading", "setDownloading", "setDownloadError", "fetch", "URL", "window", "document", body)
  await action("https://example.test/saved.pdf", false, value => state.busy.push(value), value => state.errors.push(value), async () => response,
    { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    { document: { createElement: () => link, body: { appendChild() {} } }, setTimeout: callback => callback() },
    { fileName: "Quote - V2.pdf" })
  state.filename = link.download
  return state
}

test("downloads the saved PDF with its version filename and ends busy state", async () => {
  const result = await run(new Response(new Blob(["%PDF-1.7\nfixture"])))
  assert.equal(result.clicked, true)
  assert.equal(result.filename, "Quote - V2.pdf")
  assert.deepEqual(result.busy, [true, false])
  assert.deepEqual(result.errors, [false])
})

for (const [name, response] of [
  ["expired access", new Response("Denied", { status: 403 })],
  ["non-PDF response", new Response("<html>Error</html>")],
  ["empty file", new Response("")],
]) {
  test(`${name} shows an error without downloading an invalid file`, async () => {
    const result = await run(response)
    assert.equal(result.clicked, false)
    assert.deepEqual(result.errors, [false, true])
    assert.deepEqual(result.busy, [true, false])
  })
}
