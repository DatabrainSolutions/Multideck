import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const financePage = readFileSync(new URL("../src/pages/finance-page.tsx", import.meta.url), "utf8")
const lineEditor = readFileSync(new URL("../src/components/multideck/finance-document-line-editor.tsx", import.meta.url), "utf8")

test("manually created finance documents are always ad hoc", () => {
  assert.match(financePage, /id="finance-document-source" value=\{t\("Ad hoc"\)\} readOnly/)
  assert.match(financePage, /sourceJobId: null/)
  assert.match(financePage, /sourceKind="manual"/)
  assert.doesNotMatch(financePage, /Ad hoc or ancillary|Freight job|setSourceKind|setSourceJobId/)
})

test("the shared line editor retains job charge support for job-originated documents", () => {
  assert.match(lineEditor, /sourceKind: "manual" \| "job"/)
  assert.match(lineEditor, /sourceKind === "job" && jobChargeOptions\.length/)
})
