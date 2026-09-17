import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"

const compiled = await build({ entryPoints: [new URL("../src/lib/customs-field-help.ts", import.meta.url).pathname], bundle: true, platform: "node", format: "esm", write: false })
const { customsFieldHelp } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`)

test("every explicitly labelled box-number field has purpose-specific help", async () => {
  const source = await readFile(new URL("../src/pages/customs-declarations-page.tsx", import.meta.url), "utf8")
  const tags = source.match(/<(?:TextField|SelectField|FieldShell|TextAreaField|CustomsOrganisationField)\b[^>]+>/gs) ?? []
  for (const tag of tags) {
    const label = tag.match(/label="([^"]+)"/)?.[1]
    const box = tag.match(/customsBox="([^"]+)"/)?.[1]
    const de = tag.match(/dataElement="([^"]+)"/)?.[1]
    if (label && box) assert.ok(customsFieldHelp(label, de), `${label}: DE ${de}, Box ${box}`)
  }
})

test("fields sharing a data element keep separate explanations", () => {
  for (const [de, labels] of [["2/7", ["Warehouse type", "Warehouse identifier"]], ["3/39", ["Authorisation identifier", "Authorisation category"]], ["4/9", ["Code identifying", "Amount", "Currency code"]], ["2/3", ["Additional document ID", "Additional document type", "Additional document name"]]]) {
    assert.equal(new Set(labels.map(label => customsFieldHelp(label, de))).size, labels.length)
  }
  assert.notEqual(customsFieldHelp("Currency code", "4/9"), customsFieldHelp("Currency code", "8/3"))
})

test("unknown fields do not get misleading generic box guidance", () => {
  assert.equal(customsFieldHelp("Unknown field", "44"), undefined)
  assert.match(customsFieldHelp("Company", "3/17"), /declarant/)
  assert.match(customsFieldHelp("Company", "3/10"), /consignee/)
})
