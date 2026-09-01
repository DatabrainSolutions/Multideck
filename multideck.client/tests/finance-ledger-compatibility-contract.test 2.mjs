import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const api = readFileSync(new URL("../src/lib/finance-subledger-api.ts", import.meta.url), "utf8")
const page = readFileSync(new URL("../src/pages/finance-page.tsx", import.meta.url), "utf8")

test("legacy finance responses are normalised before register rendering", () => {
  for (const evidence of [
    "normaliseFinanceDocument",
    "normaliseFinanceCashTransaction",
    '"update_required"',
    "FINDoc_ExportStatusCode: statusString(value.FINDoc_ExportStatusCode, statusString(value.FINDoc_PostingStatusCode, \"not_available\"))",
    "FINCash_ExportStatusCode: statusString(value.FINCash_ExportStatusCode, statusString(value.FINCash_PostingStatusCode, \"not_available\"))",
    "result.documents.map(normaliseFinanceDocument)",
    "result.cashTransactions.map(normaliseFinanceCashTransaction)",
  ]) assert.ok(api.includes(evidence), `Missing compatibility evidence: ${evidence}`)
})

test("the finance register discloses when native status is unavailable", () => {
  assert.ok(page.includes("Native ledger update required"))
  assert.ok(page.includes("native posting status and financial reports must not be relied on"))
  assert.ok(page.includes('FINDoc_NativePostingStatusCode === "update_required"'))
  assert.ok(page.includes('FINCash_NativePostingStatusCode === "update_required"'))
})
