import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import {
  clearCustomsInvoiceImportRecovery,
  hasCustomsInvoiceImportRecovery,
  moveCustomsInvoiceImportRecovery,
  readCustomsInvoiceImportRecovery,
  saveCustomsInvoiceImportRecovery,
} from "../src/lib/customs-invoice-import-recovery.ts"
import type { ExtractedInvoiceLine } from "../src/lib/customs-invoice-import.ts"

const values = new Map<string, string>()
let rejectEvidence = false
const sessionStorage = {
  get length() { return values.size },
  clear() { values.clear() },
  getItem(key: string) { return values.get(key) ?? null },
  key(index: number) { return [...values.keys()][index] ?? null },
  removeItem(key: string) { values.delete(key) },
  setItem(key: string, value: string) {
    if (rejectEvidence && value.includes('"blocks"')) throw new Error("quota")
    values.set(key, value)
  },
}

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { sessionStorage },
})

beforeEach(() => {
  sessionStorage.clear()
  rejectEvidence = false
})

const line: ExtractedInvoiceLine = {
  id: "line-1",
  invoiceLine: 1,
  page: 1,
  sku: "SKU-44",
  commodityCode: "8471300000",
  description: "Rugged laptop computer",
  quantity: 4,
  unitPrice: 600,
  currency: "GBP",
  netMass: 8,
  grossMass: 10,
  originCountry: "GB",
  packageKind: "CT",
  packageMarks: "LAPTOPS",
  packageCount: 1,
}

function recovery() {
  return {
    invoiceName: "commercial-invoice.pdf",
    extractedInvoiceNumber: "INV-44",
    lines: [line],
    selections: { "line-1": { include: false, consolidate: false } },
    descriptionOverrides: { "group-8471300000": "Rugged computers" },
    evidencePages: [{
      page: 1,
      width: 1000,
      height: 1400,
      blocks: [{ id: "row-1", type: "line", text: "SKU-44 Rugged laptop", box: { x: 0.1, y: 0.2, width: 0.8, height: 0.03 } }],
    }],
    activeLineId: "line-1",
    reviewFilter: "approved" as const,
    reviewTab: "result" as const,
  }
}

test("restores extracted fields and review decisions for one declaration", () => {
  saveCustomsInvoiceImportRecovery("declaration-1", recovery(), 50)

  const restored = readCustomsInvoiceImportRecovery("declaration-1")
  assert.equal(restored?.invoiceName, "commercial-invoice.pdf")
  assert.equal(restored?.lines[0].commodityCode, "8471300000")
  assert.equal(restored?.selections["line-1"].include, false)
  assert.equal(restored?.descriptionOverrides["group-8471300000"], "Rugged computers")
  assert.equal(restored?.reviewFilter, "approved")
  assert.equal(restored?.reviewTab, "result")
  assert.equal(restored?.savedAt, 50)
  assert.equal(hasCustomsInvoiceImportRecovery("declaration-1"), true)
  assert.equal(readCustomsInvoiceImportRecovery("declaration-2"), null)
})

test("keeps the fields when evidence is too large for session storage", () => {
  rejectEvidence = true
  saveCustomsInvoiceImportRecovery("declaration-1", recovery(), 60)

  const restored = readCustomsInvoiceImportRecovery("declaration-1")
  assert.equal(restored?.lines[0].description, "Rugged laptop computer")
  assert.deepEqual(restored?.evidencePages, [])
})

test("clears recovery after the import is applied", () => {
  saveCustomsInvoiceImportRecovery("declaration-1", recovery())
  clearCustomsInvoiceImportRecovery("declaration-1")

  assert.equal(readCustomsInvoiceImportRecovery("declaration-1"), null)
})

test("moves an unsaved declaration recovery record onto its saved id", () => {
  saveCustomsInvoiceImportRecovery("new", recovery(), 70)
  moveCustomsInvoiceImportRecovery("new", "saved-declaration-id")

  assert.equal(readCustomsInvoiceImportRecovery("new"), null)
  assert.equal(readCustomsInvoiceImportRecovery("saved-declaration-id")?.savedAt, 70)
})

test("ignores corrupt and empty recovery records", () => {
  values.set("multideck.customs.invoice-import.declaration-1", "not-json")
  assert.equal(readCustomsInvoiceImportRecovery("declaration-1"), null)

  saveCustomsInvoiceImportRecovery("declaration-2", { ...recovery(), lines: [] })
  assert.equal(hasCustomsInvoiceImportRecovery("declaration-2"), false)
})
