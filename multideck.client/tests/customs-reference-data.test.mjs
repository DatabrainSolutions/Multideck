import assert from "node:assert/strict"
import test from "node:test"
import { build } from "esbuild"

async function catalogueModule(fetchPage) {
  const output = await build({
    entryPoints: [new URL("../src/lib/customs-reference-data.ts", import.meta.url).pathname],
    bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "test-dependencies", setup(builder) {
      builder.onResolve({ filter: /^(react|@\/lib\/supabase)$/ }, args => ({ path: args.path, namespace: "test" }))
      builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: args.path === "react"
        ? "export const useEffect = () => {}; export const useState = () => {};"
        : "export const supabase = __testSupabase;" }))
    } }],
  })
  const query = { select() { return this }, in() { return this }, order() { return this }, range: fetchPage }
  const module = { exports: {} }
  new Function("module", "exports", "__testSupabase", output.outputFiles[0].text)(module, module.exports, { from: () => query })
  return module.exports
}

function row(catalog, code, direction = "all", name = code) {
  return { catalog_code: catalog, option_code: code, option_name: name, option_description: null, direction, sort_order: 0 }
}

test("loads beyond one API page, retains leading zeroes, and prefers direction-specific codes", async () => {
  const calls = []
  let rows
  const api = await catalogueModule(async (from, to) => { calls.push([from, to]); return { data: rows.slice(from, to + 1), error: null } })
  rows = api.customsCatalogCodes.map(code => row(code, "000"))
  rows.push(...Array.from({ length: 600 }, (_, i) => row("procedure_code", String(i).padStart(4, "0"))))
  rows.push(row("procedure_code", "0200", "import", "Import-specific"))
  rows.push(row("procedure_code", "0200", "all", "Shared"))
  rows.push(row("procedure_code", "9999", "export"))
  const result = await api.loadCustomsReferenceData("import")
  assert.equal(calls.length, 2)
  assert.deepEqual(result.procedure_code.filter(x => x.code === "0200").map(x => x.name), ["Import-specific"])
  assert.ok(result.procedure_code.some(x => x.code === "0001"))
  assert.ok(!result.procedure_code.some(x => x.code === "9999"))
  assert.equal(await api.loadCustomsReferenceData("import"), result)
  assert.equal(calls.length, 2, "complete results are cached")
})

test("rejects partial refreshes and retries after failure instead of caching incomplete data", async () => {
  let fail = true
  let rows
  const api = await catalogueModule(async (from, to) => from > 0 && fail
    ? { data: null, error: new Error("Unavailable") }
    : { data: rows.slice(from, to + 1), error: null })
  rows = api.customsCatalogCodes.map(code => row(code, "000"))
  rows.push(...Array.from({ length: 500 }, (_, i) => row("procedure_code", String(i).padStart(4, "0"))))
  await assert.rejects(api.loadCustomsReferenceData("import"), /Unavailable/)
  fail = false
  assert.ok((await api.loadCustomsReferenceData("import")).procedure_code.length > 400)
})

test("rejects empty or missing catalogues", async () => {
  const api = await catalogueModule(async () => ({ data: [], error: null }))
  await assert.rejects(api.loadCustomsReferenceData("import"), /incomplete/)
})

test("import menus contain the iCustoms snapshot while exports retain their own catalogue", async () => {
  let rows
  const api = await catalogueModule(async () => ({ data: rows, error: null }))
  rows = api.customsCatalogCodes.map(code => row(code,
    code === "procedure_code" ? "4000" : code === "additional_procedure_code" ? "000" : "GB"))
  const result = await api.loadCustomsReferenceData("import")
  assert.equal(result.procedure_code.length, 81)
  assert.equal(result.additional_procedure_code.length, 105)
  assert.equal(new Set(result.procedure_code.map(x => x.code)).size, 81)
  assert.ok(result.procedure_code.some(x => x.code === "7878"))
  assert.ok(result.additional_procedure_code.some(x => x.code === "F22"))
  assert.ok(!result.additional_procedure_code.some(x => x.code === "aaa"))
  assert.ok(result.additional_procedure_code.every(x => /^[A-Z0-9]{3}$/.test(x.code)))
  const exports = await api.loadCustomsReferenceData("export")
  assert.equal(exports.procedure_code.length, 1)
  assert.equal(exports.additional_procedure_code.length, 1)
})
