import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(
  new URL("../src/pages/finance-setup-page.tsx", import.meta.url),
  "utf8",
)

const documentsTab = source.slice(
  source.indexOf("function DocumentsTab"),
  source.indexOf("function MappingsTab"),
)

test("document numbering keeps internal identifiers out of the operator form", () => {
  assert.doesNotMatch(documentsTab, /sequence-code-/)
  assert.doesNotMatch(documentsTab, /meta=\{text\(row\.code\)\}/)
  assert.match(documentsTab, /label=\{t\("Sequence name"\)\}/)
  assert.match(documentsTab, /code: `finance-sequence:\$\{key\(\)\}`/)
})

test("document numbering shows a live example of the next reference", () => {
  assert.match(source, /const documentNumberExample = \(row: DraftRow\)/)
  assert.match(source, /\.padStart\(numberDigits, "0"\)/)
  assert.match(documentsTab, /\{t\("Next document"\)\}/)
  assert.match(documentsTab, /\{documentNumberExample\(row\)\}/)
  assert.match(documentsTab, /label=\{t\("Number digits"\)\}/)
})
