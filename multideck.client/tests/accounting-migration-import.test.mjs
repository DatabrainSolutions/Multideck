import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
const require = createRequire(new URL("../package.json", import.meta.url))
const { buildSync } = require("esbuild")
const { outputFiles } = buildSync({ stdin: { contents: `export * from './src/lib/accounting-migration-import.ts'; export * from '../supabase/functions/_shared/accounting-migration-reconciliation.ts';`, resolveDir: new URL("..", import.meta.url).pathname }, bundle: true, write: false, format: "esm", platform: "node", target: "es2022", logLevel: "silent" })
const { migrationAmount, migrationDate, trialBalanceFromUpload, openItemsFromUpload, readMigrationUpload, reconcileAccountingMigration } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`)
const upload = rows => ({ name: "source.xlsx", sha256: "source", sheetName: "Balances", sheetNames: ["Balances"], dateSystem: "1900", rows })
const tbMapping = { headerRow: 3, columns: { accountCode: 0, debit: 1, credit: 2 }, numberFormat: "decimal-point", balanceMode: "debit-credit" }
const itemFields = ["sourceId", "partyCode", "reference", "accountCode", "kind", "documentDate", "dueDate", "currency", "originalAmount", "outstandingAmount", "outstandingBaseAmount"]
const itemMapping = { headerRow: 1, columns: Object.fromEntries(itemFields.map((field, index) => [field, index])), numberFormat: "decimal-point", dateFormat: "day-first", amountConvention: "positive", fixedKind: "customer_invoice", kindValues: { INV: "customer_invoice", CRD: "customer_credit" } }
const itemRow = extra => ({ number: 8, values: ["0001", "C001", "INV-001", "6210.00.00", "INV", "31/08/2026", "", "GBP", "120", "100", "100"], ...extra })
const itemsUpload = row => upload([{ number: 1, values: itemFields }, row])

test("explicit number conventions preserve four decimals and reject ambiguous formatting", () => {
  assert.equal(migrationAmount("1,234.5678", "decimal-point", false), "1234.5678")
  assert.equal(migrationAmount("1.234,5678", "decimal-comma", false), "1234.5678")
  assert.equal(migrationAmount("(1,234.56)", "decimal-point", true), "-1234.5600")
  assert.equal(migrationAmount("1234.56", "decimal-comma", false, true), "1234.5600", "Excel numeric cells are locale independent")
  assert.equal(migrationAmount("999999999999.9999", "decimal-point", false), "999999999999.9999")
  for (const value of ["1.23456", "1e3", "£100", "1,23", "", "=1+1", "-1", "1000000000000", "(-1)"]) assert.throws(() => migrationAmount(value, "decimal-point", false))
})
test("dates honour explicit locale and Excel epoch, and reject invalid days and times", () => {
  assert.equal(migrationDate("01/02/2026", "day-first", false, "1900"), "2026-02-01")
  assert.equal(migrationDate("01/02/2026", "month-first", false, "1900"), "2026-01-02")
  assert.equal(migrationDate("61", "iso", true, "1900"), "1900-03-01")
  assert.equal(migrationDate("0", "iso", true, "1904"), "1904-01-01")
  assert.equal(migrationDate("1462", "iso", true, "1900"), "1904-01-01")
  for (const [value, format, numeric, epoch] of [["60", "iso", true, "1900"], ["-1", "iso", true, "1904"], ["46000.5", "iso", true, "1900"], ["31/02/2026", "day-first", false, "1900"], ["2026-02-30", "iso", false, "1900"], ["01/02/26", "day-first", false, "1900"]]) assert.throws(() => migrationDate(value, format, numeric, epoch))
})
test("closing TB keeps exact codes and source rows, blank sides become zero", () => {
  const input = upload([{ number: 1, values: ["Report title"] }, { number: 3, values: ["A/C", "Dr", "Cr"] }, { number: 5, values: ["0010.00.00", "100.0001", ""] }, { number: 9, values: ["8210.00.00", "", "100.0001"] }])
  const before = structuredClone(input)
  const result = trialBalanceFromUpload(input, tbMapping)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.sourceRows, [5, 9])
  assert.equal(result.rows[0].accountCode, "0010.00.00")
  assert.equal(result.rows[0].credit, "0.0000")
  assert.deepEqual(input, before)
})
test("signed TB splits debit-positive balances without floats or rounding", () => {
  const result = trialBalanceFromUpload(upload([{ number: 3, values: ["Code", "Balance"] }, { number: 4, values: ["0010", "(96.0001)"] }]), { ...tbMapping, balanceMode: "signed", columns: { accountCode: 0, balance: 1 } })
  assert.deepEqual(result.rows, [{ accountCode: "0010", debit: "0.0000", credit: "96.0001" }])
})
test("mapping errors and one failed row prevent all partial results", () => {
  const data = upload([{ number: 3, values: ["Code", "Dr", "Cr"] }, { number: 4, values: ["0010", "10", "0"] }, { number: 7, values: ["Total", "=SUM(B4:B6)", "0"] }])
  const result = trialBalanceFromUpload(data, tbMapping)
  assert.equal(result.rows.length, 0); assert.equal(result.sourceRows.length, 0)
  assert.equal(result.totalSourceRows, 2); assert.equal(result.issues[0].row, 7)
  assert.ok(trialBalanceFromUpload(data, { ...tbMapping, columns: { accountCode: 0, debit: 1, credit: 1 } }).issues.length)
  assert.ok(trialBalanceFromUpload(data, { ...tbMapping, columns: { accountCode: 0 } }).issues.length)
})
test("Excel numeric identifiers and cell errors are explicit failures", () => {
  const data = upload([{ number: 3, values: ["Code", "Dr", "Cr"] }, { number: 4, values: ["10", "1", "0"], cellTypes: ["number", "number", "number"] }])
  assert.match(trialBalanceFromUpload(data, tbMapping).issues[0].message, /identifiers as text/)
  data.rows[1].cellTypes = ["text", "error", "number"]
  assert.match(trialBalanceFromUpload(data, tbMapping).issues[0].message, /spreadsheet error/)
})
test("open-item conversion retains original and source FX carrying values without revaluation", () => {
  const row = itemRow(); row.values[7] = "EUR"; row.values[8] = "150"; row.values[9] = "125"
  const result = openItemsFromUpload(itemsUpload(row), itemMapping)
  assert.deepEqual(result.issues, [])
  assert.equal(result.rows[0].sourceId, "0001")
  assert.equal(result.rows[0].outstandingAmount, "125.0000")
  assert.equal(result.rows[0].outstandingBaseAmount, "100.0000")
  assert.equal(result.rows[0].documentDate, "2026-08-31")
  assert.equal(result.rows[0].dueDate, undefined)
})
test("credit signs require a reviewed type and explicit source convention", () => {
  const row = itemRow(); row.values[4] = "CRD"; row.values[8] = "-120"; row.values[9] = "-100"; row.values[10] = "-100"
  assert.ok(openItemsFromUpload(itemsUpload(row), itemMapping).issues.length)
  const signed = { ...itemMapping, amountConvention: "debit-positive" }
  assert.equal(openItemsFromUpload(itemsUpload(row), signed).rows[0].kind, "customer_credit")
  assert.equal(openItemsFromUpload(itemsUpload(row), signed).rows[0].outstandingAmount, "100.0000")
  row.values[4] = "INV"
  assert.ok(openItemsFromUpload(itemsUpload(row), signed).issues.length, "Do not blindly absolute-value a wrong sign")
  row.values[4] = "UNKNOWN"
  assert.match(openItemsFromUpload(itemsUpload(row), signed).issues[0].message, /Map transaction type/)
})
test("CSV upload is hashed, handles quotes and BOM, and rejects oversized or unsupported sources", async () => {
  const data = new File(['\uFEFFCode,Dr,Cr\r\n"0010.00.00","1,234.56",0'], "tb.csv")
  const first = await readMigrationUpload(data), second = await readMigrationUpload(data)
  assert.equal(first.sha256, second.sha256); assert.match(first.sha256, /^[a-f0-9]{64}$/)
  assert.equal(first.rows[1].values[0], "0010.00.00")
  assert.equal(first.rows[1].values[1], "1,234.56")
  await assert.rejects(readMigrationUpload(new File(["x"], "old.xls")), /xlsx/)
  await assert.rejects(readMigrationUpload({ name: "large.csv", size: 6000000 }), /5 MB/)
})
test("converted files reconcile against actual authoritative model; missing AR detail still blocks", () => {
  const data = upload([{ number: 3, values: ["Code", "Dr", "Cr"] }, { number: 4, values: ["6210.00.00", "100", "0"] }, { number: 5, values: ["0010.00.00", "0", "100"] }])
  const trialBalance = trialBalanceFromUpload(data, tbMapping).rows
  const openItems = openItemsFromUpload(itemsUpload(itemRow()), itemMapping).rows
  const accounts = [{ id: "ar", code: "6210.00.00", active: true, control: "receivables" }, { id: "bank", code: "0010.00.00", active: true, control: null }]
  const input = { cutoffDate: "2026-09-01", baseCurrency: "GBP", trialBalance, openItems }
  const result = reconcileAccountingMigration(input, accounts, "GBP")
  assert.equal(result.reconciled, true); assert.equal(result.postingAuthorised, false)
  assert.equal(reconcileAccountingMigration({ ...input, openItems: [] }, accounts, "GBP").reconciled, false)
})

test("semicolon and tab exports and BOM-marked UTF-16 retain the source without encoding guesses", async () => {
  const semicolon = await readMigrationUpload(new File(['Code;Balance\n0010;"1.234,56"'], "tb.csv"), undefined, ";")
  assert.deepEqual(semicolon.rows[1].values, ["0010", "1.234,56"])
  const text = "Code\tBalance\n0010\t100"
  const bytes = new Uint8Array(2 + text.length * 2); bytes[0] = 255; bytes[1] = 254
  for (let i = 0; i < text.length; i++) { bytes[2 + i * 2] = text.charCodeAt(i) & 255; bytes[3 + i * 2] = text.charCodeAt(i) >> 8 }
  const tab = await readMigrationUpload(new File([bytes], "unicode.csv"), undefined, "\t")
  assert.deepEqual(tab.rows[1].values, ["0010", "100"])
  await assert.rejects(readMigrationUpload(new File([new Uint8Array([0xc0, 0xaf])], "bad.csv")), /UTF-8/)
})
