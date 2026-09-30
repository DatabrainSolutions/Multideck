import { parseJournalCsv } from "./journal-import"

export type SourceRow = { number: number; values: string[]; cellTypes?: string[] }
export type MigrationUpload = {
  name: string; sha256: string; sheetName: string; sheetNames: string[]; dateSystem: "1900" | "1904"; rows: SourceRow[]; delimiter?: "," | ";" | "\t"
}
export type NumberFormat = "decimal-point" | "decimal-comma"
export type DateFormat = "iso" | "day-first" | "month-first"
export const openingKinds = ["customer_invoice", "customer_credit", "customer_receipt", "supplier_invoice", "supplier_credit", "supplier_payment"] as const
export type OpeningKind = typeof openingKinds[number]
export type TrialBalanceInput = { accountCode: string; debit: string; credit: string }
export type OpeningItemInput = { sourceId: string; partyCode: string; reference: string; accountCode: string; kind: OpeningKind; documentDate: string; dueDate?: string; currency: string; originalAmount: string; originalBaseAmount: string; outstandingAmount: string; outstandingBaseAmount: string; historicalVatEvidenceRef?: string }
export type TrialField = "accountCode" | "debit" | "credit" | "balance"
export type ItemField = "sourceId" | "partyCode" | "reference" | "accountCode" | "kind" | "documentDate" | "dueDate" | "currency" | "originalAmount" | "originalBaseAmount" | "outstandingAmount" | "outstandingBaseAmount" | "historicalVatEvidenceRef"
export type ImportMapping<F extends string> = { headerRow: number; columns: Partial<Record<F, number>>; numberFormat: NumberFormat }
export type TrialMapping = ImportMapping<TrialField> & { balanceMode: "debit-credit" | "signed" }
export type ItemMapping = ImportMapping<ItemField> & { dateFormat: DateFormat; amountConvention: "positive" | "debit-positive"; fixedKind: OpeningKind; kindValues: Record<string, OpeningKind> }
export type ImportIssue = { row?: number; field?: string; message: string }
export type ImportResult<T> = { rows: T[]; sourceRows: number[]; issues: ImportIssue[]; totalSourceRows: number }

const identifierFields = new Set(["accountCode", "partyCode", "sourceId", "reference"])
const sign = (kind: OpeningKind) => ["customer_invoice", "supplier_credit", "supplier_payment"].includes(kind) ? 1n : -1n
const integer = (value: string) => BigInt(value.replace(".", ""))
const decimal = (units: bigint) => `${units < 0n ? "-" : ""}${(units < 0n ? -units : units) / 10000n}.${String((units < 0n ? -units : units) % 10000n).padStart(4, "0")}`

export function migrationAmount(raw: string, format: NumberFormat, allowNegative: boolean, numericCell = false): string {
  let value = raw.trim()
  let negative = false
  if (/^\(.*\)$/.test(value)) { negative = true; value = value.slice(1, -1) }
  else if (value.startsWith("-")) { negative = true; value = value.slice(1) }
  if (negative && !allowNegative) throw new Error("Use a non-negative amount with the selected sign convention.")
  const commaDecimal = !numericCell && format === "decimal-comma"
  const pattern = numericCell ? /^\d+(?:\.\d{1,4})?$/ : commaDecimal
    ? /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,4})?$/
    : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,4})?$/
  if (!pattern.test(value)) throw new Error("Use the selected decimal format, at most four decimal places, and no currency symbols or formulas.")
  if (!numericCell) value = commaDecimal ? value.replaceAll(".", "").replace(",", ".") : value.replaceAll(",", "")
  const [whole, fraction = ""] = value.split(".")
  const canonicalWhole = whole.replace(/^0+(?=\d)/, "")
  if (canonicalWhole.length > 12) throw new Error("Amount exceeds the ledger limit of twelve whole-number digits.")
  const units = BigInt(canonicalWhole) * 10000n + BigInt(fraction.padEnd(4, "0"))
  return decimal(negative ? -units : units)
}

export function migrationDate(raw: string, format: DateFormat, numericCell: boolean, dateSystem: "1900" | "1904"): string {
  const value = raw.trim()
  if (numericCell) {
    if (!/^\d{1,7}$/.test(value)) throw new Error("Excel dates must be whole-day serial values, without times.")
    const serial = Number(value)
    if ((dateSystem === "1900" && (serial < 1 || serial === 60)) || serial > 2958465) throw new Error("The Excel date is invalid.")
    const epoch = dateSystem === "1904" ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31)
    const days = dateSystem === "1900" && serial > 60 ? serial - 1 : serial
    const iso = new Date(epoch + days * 86400000).toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("The Excel date is outside the supported range.")
    return iso
  }
  let result = value
  if (format !== "iso") {
    const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value)
    if (!match) throw new Error("Use the selected date format with a four-digit year.")
    const [, first, second, year] = match
    result = `${year}-${(format === "day-first" ? second : first).padStart(2, "0")}-${(format === "day-first" ? first : second).padStart(2, "0")}`
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error("Use a valid date in the selected format.")
  return result
}

function mappedRows<F extends string, T>(upload: MigrationUpload, mapping: ImportMapping<F>, required: F[], limit: number, convert: (read: (field: F, optional?: boolean) => string, numeric: (field: F) => boolean, dateCell: (field: F) => boolean) => T): ImportResult<T> {
  const result: ImportResult<T> = { rows: [], sourceRows: [], issues: [], totalSourceRows: 0 }
  const header = upload.rows.find(row => row.number === mapping.headerRow)
  if (!header) { result.issues.push({ message: "Choose the source header row." }); return result }
  const selected = Object.entries(mapping.columns).filter(([, index]) => index !== undefined)
  if (selected.some(([, index]) => !Number.isInteger(index) || Number(index) < 0 || Number(index) >= header.values.length) || new Set(selected.map(([, index]) => index)).size !== selected.length) {
    result.issues.push({ message: "Map each field to a different source column." }); return result
  }
  for (const field of required) if (mapping.columns[field] === undefined) result.issues.push({ field, message: "Choose the source column for this field." })
  if (result.issues.length) return result
  const data = upload.rows.filter(row => row.number > mapping.headerRow && row.values.some(value => value.trim()))
  result.totalSourceRows = data.length
  if (!data.length || data.length > limit) { result.issues.push({ message: `Provide between 1 and ${limit.toLocaleString("en-GB")} non-empty data rows.` }); return result }
  for (const row of data) {
    let currentField: F | undefined
    const read = (field: F, optional = false) => {
      currentField = field
      const index = mapping.columns[field]
      const value = index === undefined ? "" : (row.values[index] ?? "").trim()
      if (!value && !optional) throw new Error("A value is required.")
      const type = index === undefined ? undefined : row.cellTypes?.[index]
      if (["error", "boolean"].includes(type ?? "")) throw new Error("Replace the spreadsheet error or boolean with a valid value.")
      if (identifierFields.has(field) && type === "number") throw new Error("Store identifiers as text in Excel so leading zeros and the original code are preserved.")
      return value
    }
    const numeric = (field: F) => row.cellTypes?.[mapping.columns[field] ?? -1] === "number"
    const dateCell = (field: F) => row.cellTypes?.[mapping.columns[field] ?? -1] === "date"
    try { result.rows.push(convert(read, numeric, dateCell)); result.sourceRows.push(row.number) }
    catch (error) { result.issues.push({ row: row.number, field: currentField, message: error instanceof Error ? error.message : "This row could not be read." }) }
  }
  // Never offer a partial import when even one source row failed conversion.
  if (result.issues.length) { result.rows = []; result.sourceRows = [] }
  return result
}

export function trialBalanceFromUpload(upload: MigrationUpload, mapping: TrialMapping): ImportResult<TrialBalanceInput> {
  return mappedRows<TrialField, TrialBalanceInput>(upload, mapping, mapping.balanceMode === "signed" ? ["accountCode", "balance"] : ["accountCode", "debit", "credit"], 10000, (read, numeric) => {
    const accountCode = read("accountCode")
    if (mapping.balanceMode === "signed") {
      const balance = integer(migrationAmount(read("balance"), mapping.numberFormat, true, numeric("balance")))
      return { accountCode, debit: decimal(balance > 0n ? balance : 0n), credit: decimal(balance < 0n ? -balance : 0n) }
    }
    return { accountCode, debit: migrationAmount(read("debit", true) || "0", mapping.numberFormat, false, numeric("debit")), credit: migrationAmount(read("credit", true) || "0", mapping.numberFormat, false, numeric("credit")) }
  })
}

export function openItemsFromUpload(upload: MigrationUpload, mapping: ItemMapping): ImportResult<OpeningItemInput> {
  return mappedRows<ItemField, OpeningItemInput>(upload, mapping, ["sourceId", "partyCode", "reference", "accountCode", "documentDate", "currency", "originalAmount", "originalBaseAmount", "outstandingAmount", "outstandingBaseAmount"], 50000, (read, numeric, dateCell) => {
    const sourceId = read("sourceId"), partyCode = read("partyCode"), reference = read("reference"), accountCode = read("accountCode")
    const sourceKind = mapping.columns.kind === undefined ? "" : read("kind")
    const kind = sourceKind ? mapping.kindValues[sourceKind] : mapping.fixedKind
    if (!openingKinds.includes(kind)) throw new Error(`Map transaction type "${sourceKind}" to an invoice, credit or unapplied cash type.`)
    const date = (field: "documentDate" | "dueDate", optional = false) => {
      const raw = read(field, optional)
      const value = dateCell(field) ? raw.replace(/T00:00:00(?:\.0+)?Z?$/, "") : raw
      return value ? migrationDate(value, dateCell(field) ? "iso" : mapping.dateFormat, numeric(field), upload.dateSystem) : undefined
    }
    const documentDate = date("documentDate")!, dueDate = date("dueDate", true), currency = read("currency").toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Use a three-letter currency code.")
    const amount = (field: "originalAmount" | "originalBaseAmount" | "outstandingAmount" | "outstandingBaseAmount") => {
      const units = integer(migrationAmount(read(field), mapping.numberFormat, mapping.amountConvention === "debit-positive", numeric(field)))
      const positive = mapping.amountConvention === "debit-positive" ? units * sign(kind) : units
      if (positive <= 0n) throw new Error("Use a positive unpaid amount, with the correct sign for the selected transaction type and convention.")
      return decimal(positive)
    }
    const historicalVatEvidenceRef = read("historicalVatEvidenceRef", true)
    return { sourceId, partyCode, reference, accountCode, kind, documentDate, ...(dueDate ? { dueDate } : {}), currency, originalAmount: amount("originalAmount"), originalBaseAmount: amount("originalBaseAmount"), outstandingAmount: amount("outstandingAmount"), outstandingBaseAmount: amount("outstandingBaseAmount"), ...(historicalVatEvidenceRef ? { historicalVatEvidenceRef } : {}) }
  })
}

export async function readMigrationUpload(file: File, sheetName?: string, delimiter: "," | ";" | "\t" = ","): Promise<MigrationUpload> {
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("Choose a non-empty file of 5 MB or smaller.")
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension !== "csv" && extension !== "xlsx") throw new Error("Choose a CSV or Excel .xlsx file. Save older Excel files as .xlsx first.")
  const bytes = await file.arrayBuffer()
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("")
  if (extension === "csv") {
    const prefix = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2))
    const encoding = prefix[0] === 255 && prefix[1] === 254 ? "utf-16le" : prefix[0] === 254 && prefix[1] === 255 ? "utf-16be" : "utf-8"
    let source: string
    try { source = new TextDecoder(encoding, { fatal: true }).decode(bytes) }
    catch { throw new Error("Save the CSV as UTF-8, or use a Unicode CSV with a byte-order mark, then try again.") }
    const rows = parseJournalCsv(source, delimiter)
    if (rows.length > 50100 || rows.some(row => row.values.length > 256)) throw new Error("The file exceeds 50,100 rows or 256 columns. Export the required accounting data only.")
    return { name: file.name, sha256, sheetName: "CSV", sheetNames: ["CSV"], dateSystem: "1900", rows, delimiter }
  }
  const { readFinanceWorkbook } = await import("./finance-document-excel")
  return { name: file.name, sha256, ...await readFinanceWorkbook(file, { rejectFormulas: true, sheetName, catalogOnly: !sheetName }) }
}
