import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { collectExportPages, exportDateKey, exportPresetRange, inExportDateRange, sortExportRows, validExportRange } from "../src/lib/table-export.ts"
import { buildCsv } from "../src/lib/csv-export.ts"

test("date presets contain exactly 7, 30 or 90 inclusive UTC calendar days", () => {
  const now = new Date("2026-09-03T23:59:59Z")
  for (const days of [7, 30, 90]) {
    const range = exportPresetRange(`${days}D`, now)
    assert.equal(range.end, "2026-09-03")
    assert.equal((Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1, days)
  }
  assert.deepEqual(exportPresetRange("7D", new Date("2026-03-30T00:10:00+01:00")), { start: "2026-03-23", end: "2026-03-29" })
  assert.deepEqual(exportPresetRange("All time", now), { start: null, end: null })
})

test("custom dates validate exact calendar dates and use inclusive UTC boundaries", () => {
  const range = { start: "2026-09-01", end: "2026-09-03" }
  assert.ok(validExportRange(range))
  assert.ok(inExportDateRange("2026-09-01T00:00:00Z", range))
  assert.ok(inExportDateRange("2026-09-03T23:59:59.999Z", range))
  assert.ok(!inExportDateRange("2026-09-04T00:00:00Z", range))
  assert.ok(!inExportDateRange("2026-09-01T00:30:00+01:00", range))
  assert.equal(exportDateKey("2026-09-03"), "2026-09-03")
  assert.ok(validExportRange({ start: "2024-02-29", end: "2024-02-29" }))
  for (const invalid of [
    { start: "2026-02-29", end: "2026-03-01" },
    { start: "2026-09-03", end: "2026-09-01" },
    { start: null, end: "2026-09-03" },
    { start: "invalid", end: "2026-09-03" },
  ]) assert.ok(!validExportRange(invalid))
  assert.ok(!inExportDateRange(null, range))
  assert.ok(!inExportDateRange("invalid", range))
  assert.ok(inExportDateRange(null, { start: null, end: null }))
})

test("all records traverse every authorised page and preserve endpoint order", async () => {
  const records = Array.from({ length: 237 }, (_, id) => ({ id: String(id) }))
  const offsets = []
  const result = await collectExportPages(async ({ offset, limit }) => {
    offsets.push(offset)
    assert.equal(limit, 100)
    return { rows: records.slice(offset, offset + limit), total: records.length }
  }, (row) => row.id)
  assert.deepEqual(offsets, [0, 100, 200])
  assert.deepEqual(result, records)
})

test("a smaller server cap advances by returned count; exact final pages need no extra call", async () => {
  const records = Array.from({ length: 90 }, (_, id) => ({ id: String(id) }))
  const offsets = []
  const result = await collectExportPages(async ({ offset }) => {
    offsets.push(offset)
    return { rows: records.slice(offset, offset + 30), total: records.length }
  }, (row) => row.id)
  assert.deepEqual(offsets, [0, 30, 60])
  assert.equal(result.length, 90)
  assert.deepEqual(await collectExportPages(async () => ({ rows: [], total: 0 }), (row) => row.id), [])
})

test("incomplete, inconsistent and unauthorised reads fail without a partial result", async () => {
  const scenarios = [
    [{ rows: [{ id: "1" }], total: 2 }, { rows: [], total: 2 }],
    [{ rows: [{ id: "1" }], total: 2 }, { rows: [{ id: "2" }], total: 3 }],
    [{ rows: [{ id: "1" }], total: 2 }, { rows: [{ id: "1" }], total: 2 }],
    [{ rows: [{ id: "" }], total: 1 }],
    [{ rows: [{ id: "1" }], total: 0 }],
    [{ rows: [], total: null }],
    [{ rows: [], total: -1 }],
  ]
  for (const pages of scenarios) {
    let index = 0
    await assert.rejects(collectExportPages(async () => pages[index++], (row) => row.id), /changed|incomplete/)
  }
  await assert.rejects(collectExportPages(async () => { throw Error("Access denied") }, (row) => row.id), /Access denied/)
})

test("cancellation prevents later pages and rejects an in-flight result", async () => {
  const abort = new AbortController()
  abort.abort()
  let calls = 0
  await assert.rejects(collectExportPages(async () => { calls++; return { rows: [], total: 0 } }, (row) => row.id, abort.signal), { name: "AbortError" })
  assert.equal(calls, 0)
  const during = new AbortController()
  await assert.rejects(collectExportPages(async () => { during.abort(); return { rows: [{ id: "1" }], total: 2 } }, (row) => row.id, during.signal), { name: "AbortError" })
})

test("local sorting matches display and exact current-page slicing without mutating records", () => {
  const rows = [{ id: "b", amount: 2 }, { id: "a", amount: 1 }, { id: "c", amount: 2 }, { id: "d", amount: null }]
  const sorted = sortExportRows(rows, (row) => row.amount, "desc")
  assert.deepEqual(sorted.map((row) => row.id), ["b", "c", "a", "d"])
  assert.deepEqual(sorted.slice(2, 4).map((row) => row.id), ["a", "d"])
  assert.deepEqual(rows.map((row) => row.id), ["b", "a", "c", "d"])
})

test("CSV neutralises spreadsheet formulas even with leading whitespace and escapes quotes", () => {
  const values = ["=1+1", "\t@SUM(A1)", "  +cmd", "\r-1+1", ['=2+2', 'safe'], [null, "", ["=3+3"]], -25, 'line 1\n"line 2", value']
  const csv = buildCsv(values.map((value) => ({ row: { value }, record: {} })), [{ id: "value", category: "Columns", label: "Value", getValue: ({ row }) => row.value }])
  assert.ok(csv.startsWith("\uFEFF"))
  for (const value of ["'=1+1", "'\t@SUM(A1)", "'  +cmd", "'\r-1+1", "'=2+2 | safe", "'=3+3"]) assert.ok(csv.includes(value))
  assert.ok(csv.includes('"-25"'))
  assert.ok(csv.includes('"line 1\n""line 2"", value"'))
})

test("shared register controls snapshot the actual page, gate downloads and preserve selected export", async () => {
  const table = await readFile(new URL("../src/components/multideck/data-table.tsx", import.meta.url), "utf8")
  const dialog = await readFile(new URL("../src/components/multideck/table-csv-export-dialog.tsx", import.meta.url), "utf8")
  assert.match(table, /exportPageRows\.current = \[\.\.\.pageRows\]/)
  assert.match(table, /exportConfig\.register\.loadAllRows\(controller\.signal\)/)
  assert.match(table, /offset \+= 25/)
  assert.match(table, /aria-label=\{t\("Export records"\)\}/)
  assert.match(table, /data-table-export-control/)
  assert.match(table, /setExportScope\(null\)/)
  assert.match(dialog, /MultideckDateRangePicker/)
  assert.match(dialog, /\["7D", "30D", "90D", "All time", "Custom"\]/)
  assert.match(dialog, /Dates use UTC/)
  assert.match(dialog, /disabled=\{loading \|\| Boolean\(error\) \|\| !selectedFields\.length \|\| !includedSources\.length \|\| !rangeValid\}/)
  assert.match(dialog, /role="status"|aria-live="polite"/)
})

test("comparable live registers use explicit scoped adapters and gallery documentation", async () => {
  for (const file of ["pages/crm-page", "pages/crm-accounts-page", "pages/crm-contacts-page", "pages/quotes-register-page", "pages/bookings-page", "pages/customs-declarations-page", "pages/documents-page", "pages/rates-page", "pages/admin-page", "pages/contact-cards-page", "pages/crm-phone-calls-page", "pages/customers-page", "components/multideck/warehouse-management-components", "components/multideck/warehouse-operations-components", "components/multideck/warehouse-purchase-orders-workspace", "components/multideck/warehouse-inventory-workspace"]) {
    const source = await readFile(new URL(`../src/${file}.tsx`, import.meta.url), "utf8")
    assert.match(source, /collectExportPages/, file)
  }
  const leads = await readFile(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(leads, /Export this page/)
  const gallery = await readFile(new URL("../src/data/multideck-data.ts", import.meta.url), "utf8")
  assert.match(gallery, /id: "table-export"/)
  assert.match(gallery, /componentCode: tableCsvExportDialogSource/)
})
