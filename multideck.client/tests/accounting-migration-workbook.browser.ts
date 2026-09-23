// Run in a real browser through Vite. These are in-memory test archives only.
import { zipSync, strToU8 } from "fflate"
import { readFinanceWorkbook } from "../src/lib/finance-document-excel"
import { readMigrationUpload } from "../src/lib/accounting-migration-import"

export async function runMigrationWorkbookTests() {
  let checks = 0
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); checks++ }
  const file = (options: { row?: string; shared?: string; date1904?: boolean } = {}) => new File([zipSync({
    "xl/workbook.xml": strToU8(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="${options.date1904 === false ? 0 : 1}"/><sheets><sheet name="Cover" sheetId="1" r:id="cover"/><sheet name="Open items" sheetId="2" r:id="data"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="cover" Target="worksheets/sheet1.xml"/><Relationship Id="data" Target="worksheets/sheet2.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8(options.shared ?? '<sst><si><t>0010.00.00</t></si></sst>'),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>'),
    "xl/worksheets/sheet2.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Code</t></is></c><c r="B1" t="inlineStr"><is><t>Amount</t></is></c></row>${options.row ?? '<row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3"><v>123.4567</v></c><c r="C3" t="d"><v>2026-08-31T00:00:00Z</v></c><c r="D3" t="e"><v>#VALUE!</v></c></row>'}</sheetData></worksheet>`),
  })], "migration.xlsx")
  const reject = async (fn: () => Promise<unknown>, pattern: RegExp) => { try { await fn() } catch (cause) { assert(pattern.test(String(cause)), `Wrong failure: ${cause}`); return } throw new Error("Expected rejection") }
  const catalog = await readMigrationUpload(file())
  assert(catalog.sheetNames.join("|") === "Cover|Open items", "Worksheet catalogue")
  assert(catalog.rows.length === 0 && catalog.sheetName === "", "Require worksheet selection before interpretation")
  assert(catalog.dateSystem === "1904", "Excel 1904 epoch retained")
  const selected = await readMigrationUpload(file(), "Open items")
  assert(selected.rows[1].number === 3, "Original row reference retained")
  assert(selected.rows[1].values[0] === "0010.00.00", "Shared strings preserve leading-zero dotted codes")
  assert(selected.rows[1].cellTypes?.join() === "text,number,date,error", "Retain cell types for conversion")
  assert(selected.rows[1].values[1] === "123.4567", "Raw amounts remain exact")
  assert(selected.sha256 === catalog.sha256, "Hash identifies source file independent of selected sheet")
  await reject(() => readMigrationUpload(file(), "Cover"), /formulas with values/)
  await reject(() => readMigrationUpload(file(), "Missing"), /Choose a worksheet/)
  await reject(() => readFinanceWorkbook(file({ row: '<row r="3"><c r="A3" t="s"><v>99</v></c></row>' }), { sheetName: "Open items" }), /shared text reference/)
  await reject(() => readFinanceWorkbook(file({ row: '<row r="3"><c r="A8"><v>1</v></c></row>' }), { sheetName: "Open items" }), /cell row reference/)
  await reject(() => readFinanceWorkbook(file({ row: '<row r="3"><c r="A3"><v>1</v></c><c r="A3"><v>2</v></c></row>' }), { sheetName: "Open items" }), /duplicate cell/)
  await reject(() => readFinanceWorkbook(file({ row: '<row r="3"/><row r="3"/>' }), { sheetName: "Open items" }), /duplicate row/)
  const legacy = await readFinanceWorkbook(file({ date1904: false }), { sheetName: "Open items" })
  assert(legacy.dateSystem === "1900", "Excel 1900 epoch retained")
  return { passed: checks }
}
