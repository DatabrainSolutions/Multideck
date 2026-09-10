import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const page = readFileSync(new URL("../src/pages/finance-document-page.tsx", import.meta.url), "utf8")
const editor = readFileSync(new URL("../src/components/multideck/finance-document-line-editor.tsx", import.meta.url), "utf8")
const gallery = readFileSync(new URL("../src/data/multideck-data.ts", import.meta.url), "utf8")

test("finance documents use the compact invoice layout", () => {
  assert.match(page, /InvoiceInformationField/)
  assert.match(page, /label=\{t\("Period"\)\}/)
  assert.match(page, /className="sm:col-start-2"/)
  assert.match(page, /appearance="document" showQuantity=\{ledger !== "receivables"\}/)
  assert.doesNotMatch(page, /Job reference \(optional\)|Not linked to a job/)
})

test("the finance line editor documents its invoice presentation controls", () => {
  assert.match(editor, /appearance\?: "panel" \| "document"/)
  assert.match(editor, /showQuantity\?: boolean/)
  assert.match(editor, /appearance === "document"/)
  assert.match(editor, /table-fixed/)
  assert.match(editor, /line\.chargeCode \? <span className="truncate"/)
  assert.match(editor, /const selected = !readOnly && line\.id === selectedLineId/)
  assert.match(editor, /onClick=\{readOnly \? undefined/)
  assert.match(gallery, /appearance="document"/)
  assert.match(gallery, /showQuantity=\{false\}/)
})
