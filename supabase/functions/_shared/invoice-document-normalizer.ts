// @deno-types="npm:xlsx@0.18.5/types/index.d.ts"
import * as XLSX from "npm:xlsx@0.18.5/xlsx.mjs"
import * as cptable from "npm:xlsx@0.18.5/dist/cpexcel.full.mjs"
import { PDFDocument } from "npm:pdf-lib@1.17.1"

XLSX.set_cptable(cptable)

export const INVOICE_DOCUMENT_NORMALIZER_VERSION = 2
export const MAX_PREPARED_INVOICE_BYTES = 25 * 1024 * 1024
export const MAX_PREPARED_INVOICE_PAGES = 30

const defaultMaximumInputBytes = 10 * 1024 * 1024
const maximumSpreadsheetCells = 100_000
const maximumSpreadsheetRows = 10_000
const directSpreadsheetColumns = 12
const longCellThreshold = 120
const evidenceTextLimit = 240
const carboneTimeoutMs = 45_000

type SourceKind = "pdf" | "spreadsheet" | "document" | "image"

type SourceDefinition = {
  extension: string
  mimeType: string
  acceptedMimeTypes: string[]
  kind: SourceKind
}

export type InvoiceConversionStrategy = "passthrough" | "office_pdf" | "spreadsheet_normalised"

export type InvoiceDocumentSheet = {
  name: string
  status: "included" | "empty" | "hidden"
}

export type InvoiceDocumentConversion = {
  sourceFormat: string
  sourceMimeType: string
  converted: boolean
  strategy: InvoiceConversionStrategy
  sheets: InvoiceDocumentSheet[]
  warnings: string[]
  normalizerVersion: number
}

export type PreparedInvoiceDocument = {
  pdfBytes: Uint8Array
  pageCount: number
  conversion: InvoiceDocumentConversion
  distinctiveSourceText: string[]
}

export type PrepareInvoiceDocumentInput = {
  bytes: Uint8Array
  fileName: string
  providerMimeType?: string
  maximumInputBytes?: number
  forceSpreadsheetNormalisation?: boolean
}

type SpreadsheetCell = {
  row: number
  column: number
  text: string
  wrap: boolean
  formulaWithoutValue: boolean
}

type SpreadsheetMerge = { startRow: number; startColumn: number; endRow: number; endColumn: number }

type SpreadsheetSheet = {
  name: string
  status: InvoiceDocumentSheet["status"]
  cells: SpreadsheetCell[]
  merges: SpreadsheetMerge[]
  minRow: number
  maxRow: number
  minColumn: number
  maxColumn: number
}

type SpreadsheetInspection = {
  sheets: SpreadsheetSheet[]
  warnings: string[]
  distinctiveSourceText: string[]
  safeForDirectConversion: boolean
}

const sourceDefinitions: Record<string, SourceDefinition> = {
  ".pdf": definition(".pdf", "application/pdf", ["application/pdf"], "pdf"),
  ".xlsx": definition(".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ], "spreadsheet"),
  ".xls": definition(".xls", "application/vnd.ms-excel", ["application/vnd.ms-excel"], "spreadsheet"),
  ".csv": definition(".csv", "text/csv", ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"], "spreadsheet"),
  ".tsv": definition(".tsv", "text/tab-separated-values", ["text/tab-separated-values", "text/plain", "text/csv"], "spreadsheet"),
  ".ods": definition(".ods", "application/vnd.oasis.opendocument.spreadsheet", ["application/vnd.oasis.opendocument.spreadsheet"], "spreadsheet"),
  ".docx": definition(".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ], "document"),
  ".doc": definition(".doc", "application/msword", ["application/msword"], "document"),
  ".odt": definition(".odt", "application/vnd.oasis.opendocument.text", ["application/vnd.oasis.opendocument.text"], "document"),
  ".png": definition(".png", "image/png", ["image/png"], "image"),
  ".jpg": definition(".jpg", "image/jpeg", ["image/jpeg"], "image"),
  ".jpeg": definition(".jpeg", "image/jpeg", ["image/jpeg"], "image"),
  ".webp": definition(".webp", "image/webp", ["image/webp"], "image"),
}

export class InvoiceDocumentPreparationError extends Error {
  constructor(message: string, public status = 422, public code = "invoice_document_unreadable") {
    super(message)
  }
}

export function acceptedInvoiceDocumentExtensions() {
  return Object.keys(sourceDefinitions)
}

export function acceptedInvoiceDocumentInput() {
  return acceptedInvoiceDocumentExtensions().join(",")
}

export function isSupportedInvoiceDocumentName(fileName: string) {
  return Boolean(sourceDefinitions[fileExtension(fileName)])
}

export function validateInvoiceDocumentSource(
  bytes: Uint8Array,
  fileName: string,
  providerMimeType = "",
  maximumInputBytes = defaultMaximumInputBytes,
) {
  if (!bytes.byteLength) {
    throw new InvoiceDocumentPreparationError("The selected invoice file is empty.", 400, "invoice_document_empty")
  }
  if (bytes.byteLength > maximumInputBytes) {
    throw new InvoiceDocumentPreparationError("Choose an invoice file smaller than 10 MB.", 413, "invoice_document_too_large")
  }

  const extension = fileExtension(fileName)
  const source = sourceDefinitions[extension]
  if (!source) {
    if (/\.(?:xlsm|xltm|xlam|docm|dotm)$/i.test(fileName)) {
      throw new InvoiceDocumentPreparationError("Macro-enabled invoice files are not supported. Save a macro-free copy and try again.", 415, "invoice_document_macro_enabled")
    }
    throw new InvoiceDocumentPreparationError(
      "Choose a PDF, Excel, CSV, Word, OpenDocument, PNG, JPEG or WebP invoice.",
      415,
      "invoice_document_type_unsupported",
    )
  }

  const mimeType = providerMimeType.split(";", 1)[0].trim().toLowerCase()
  if (mimeType && mimeType !== "application/octet-stream" && !source.acceptedMimeTypes.includes(mimeType)) {
    throw new InvoiceDocumentPreparationError("The invoice file type does not match its filename.", 415, "invoice_document_type_mismatch")
  }
  if (!validSignature(bytes, source)) {
    throw new InvoiceDocumentPreparationError("The invoice file type does not match its filename or the file is damaged.", 415, "invoice_document_signature_mismatch")
  }
  if (isEncryptedOfficeArchive(bytes)) {
    throw new InvoiceDocumentPreparationError("Password-protected invoice files are not supported. Save an unlocked copy and try again.", 415, "invoice_document_encrypted")
  }
  if (containsOfficeMarker(bytes, "vbaProject.bin")
    || ((source.extension === ".doc" || source.extension === ".xls") && hasLegacyOfficeMacros(bytes))) {
    throw new InvoiceDocumentPreparationError("Macro-enabled invoice files are not supported. Save a macro-free copy and try again.", 415, "invoice_document_macro_enabled")
  }
  return source
}

export async function prepareInvoiceDocument(input: PrepareInvoiceDocumentInput): Promise<PreparedInvoiceDocument> {
  const source = validateInvoiceDocumentSource(
    input.bytes,
    input.fileName,
    input.providerMimeType,
    input.maximumInputBytes,
  )
  let pdfBytes: Uint8Array
  let strategy: InvoiceConversionStrategy = source.kind === "pdf" ? "passthrough" : "office_pdf"
  let sheets: InvoiceDocumentSheet[] = []
  let warnings: string[] = []
  let distinctiveSourceText: string[] = []

  if (source.kind === "pdf") {
    pdfBytes = input.bytes
  } else if (source.kind === "image" && source.extension !== ".webp") {
    pdfBytes = await imageToPdf(input.bytes, source.mimeType)
  } else if (source.kind === "image") {
    pdfBytes = await convertWithCarbone(
      new TextEncoder().encode(imageHtml(input.bytes, source.mimeType, input.fileName)),
      input.fileName.replace(/\.[^.]+$/, ".html"),
      "C",
    )
  } else if (source.kind === "spreadsheet") {
    const inspection = inspectSpreadsheet(input.bytes, source, input.fileName)
    sheets = inspection.sheets.map(({ name, status }) => ({ name, status }))
    warnings = inspection.warnings
    distinctiveSourceText = inspection.distinctiveSourceText
    const normalise = input.forceSpreadsheetNormalisation
      || source.extension === ".csv"
      || source.extension === ".tsv"
      || !inspection.safeForDirectConversion
    if (normalise) {
      strategy = "spreadsheet_normalised"
      pdfBytes = await convertWithCarbone(
        new TextEncoder().encode(spreadsheetHtml(inspection, input.fileName)),
        input.fileName.replace(/\.[^.]+$/, ".html"),
        "C",
      )
    } else {
      strategy = "office_pdf"
      pdfBytes = await convertWithCarbone(input.bytes, input.fileName, "L")
    }
  } else {
    pdfBytes = await convertWithCarbone(input.bytes, input.fileName, "L")
  }

  const pageCount = await validatedPdfPageCount(pdfBytes)
  return {
    pdfBytes,
    pageCount,
    distinctiveSourceText,
    conversion: {
      sourceFormat: source.extension.slice(1),
      sourceMimeType: source.mimeType,
      converted: source.kind !== "pdf",
      strategy,
      sheets,
      warnings,
      normalizerVersion: INVOICE_DOCUMENT_NORMALIZER_VERSION,
    },
  }
}

export function spreadsheetCoverage(
  distinctiveSourceText: string[],
  providerPayloads: Array<Record<string, unknown>>,
) {
  if (!distinctiveSourceText.length) return { passed: true, ratio: 1, missing: [] as string[] }
  const providerText = normaliseEvidenceText(providerPayloads.flatMap((payload) => {
    const pages = Array.isArray(payload.pages) ? payload.pages : []
    return pages.flatMap((page) => {
      const source = asRecord(page)
      const blocks = Array.isArray(source.blocks) ? source.blocks : []
      return [
        text(source.markdown),
        ...blocks.map((block) => text(asRecord(block).content) || text(asRecord(block).text)),
      ]
    })
  }).join(" "))
  const compactProviderText = providerText.replaceAll(" ", "")

  const missing = distinctiveSourceText.filter((value) => {
    const compactSourceText = normaliseEvidenceText(value).replaceAll(" ", "")
    if (compactSourceText.length >= 8 && compactProviderText.includes(compactSourceText)) return false
    const tokens = distinctiveTokens(value)
    if (!tokens.length) return false
    const matched = tokens.filter((token) => providerText.includes(token)).length
    return matched / tokens.length < 0.8
  })
  const ratio = distinctiveSourceText.length
    ? (distinctiveSourceText.length - missing.length) / distinctiveSourceText.length
    : 1
  return { passed: ratio >= 0.94 && !missing.some((entry) => entry.length > longCellThreshold), ratio, missing: missing.slice(0, 5) }
}

function definition(
  extension: string,
  mimeType: string,
  acceptedMimeTypes: string[],
  kind: SourceKind,
): SourceDefinition {
  return { extension, mimeType, acceptedMimeTypes, kind }
}

function fileExtension(fileName: string) {
  return fileName.toLowerCase().match(/(\.[a-z0-9]{1,10})$/)?.[1] ?? ""
}

function validSignature(bytes: Uint8Array, source: SourceDefinition) {
  if (source.extension === ".pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
  if (source.extension === ".png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (source.extension === ".jpg" || source.extension === ".jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff])
  if (source.extension === ".webp") {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && asciiAt(bytes, 8, "WEBP")
  }
  if (source.extension === ".doc" || source.extension === ".xls") {
    return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  }
  if (source.extension === ".csv" || source.extension === ".tsv") {
    return !bytes.slice(0, Math.min(bytes.byteLength, 8_192)).includes(0)
  }
  if (!zipSignature(bytes)) return false
  if (source.extension === ".xlsx") return containsAscii(bytes, "xl/") && containsAscii(bytes, "[Content_Types].xml")
  if (source.extension === ".docx") return containsAscii(bytes, "word/") && containsAscii(bytes, "[Content_Types].xml")
  if (source.extension === ".ods") return containsAscii(bytes, "application/vnd.oasis.opendocument.spreadsheet")
  if (source.extension === ".odt") return containsAscii(bytes, "application/vnd.oasis.opendocument.text")
  return false
}

function isEncryptedOfficeArchive(bytes: Uint8Array) {
  return containsOfficeMarker(bytes, "EncryptedPackage") || containsOfficeMarker(bytes, "EncryptionInfo")
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function zipSignature(bytes: Uint8Array) {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
}

function asciiAt(bytes: Uint8Array, offset: number, expected: string) {
  return [...expected].every((character, index) => bytes[offset + index] === character.charCodeAt(0))
}

function containsAscii(bytes: Uint8Array, expected: string) {
  const needle = new TextEncoder().encode(expected)
  outer: for (let index = 0; index <= bytes.byteLength - needle.byteLength; index += 1) {
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) continue outer
    }
    return true
  }
  return false
}

function containsOfficeMarker(bytes: Uint8Array, expected: string) {
  if (containsAscii(bytes, expected)) return true
  const utf16 = new Uint8Array(expected.length * 2)
  for (let index = 0; index < expected.length; index += 1) utf16[index * 2] = expected.charCodeAt(index)
  outer: for (let index = 0; index <= bytes.byteLength - utf16.byteLength; index += 1) {
    for (let offset = 0; offset < utf16.byteLength; offset += 1) {
      if (bytes[index + offset] !== utf16[offset]) continue outer
    }
    return true
  }
  return false
}

function hasLegacyOfficeMacros(bytes: Uint8Array) {
  try {
    const compound = XLSX.CFB.read(bytes, { type: "array" })
    return compound.FullPaths.some((path: string) => /(?:^|\/)(?:VBA|Macros)(?:\/|$)|_VBA_PROJECT/i.test(path))
  } catch {
    return false
  }
}

function inspectSpreadsheet(bytes: Uint8Array, source: SourceDefinition, fileName: string): SpreadsheetInspection {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      cellFormula: true,
      cellHTML: false,
      cellNF: true,
      cellStyles: true,
      cellText: true,
      dense: false,
      bookVBA: true,
      password: undefined,
      raw: false,
    })
  } catch {
    throw new InvoiceDocumentPreparationError(
      "This spreadsheet could not be opened. Save an unlocked Excel, CSV or OpenDocument copy and try again.",
      422,
      "invoice_spreadsheet_unreadable",
    )
  }
  if ((workbook as XLSX.WorkBook & { vbaraw?: unknown }).vbaraw) {
    throw new InvoiceDocumentPreparationError(
      "Macro-enabled invoice files are not supported. Save a macro-free copy and try again.",
      415,
      "invoice_document_macro_enabled",
    )
  }

  const workbookSheetState = new Map((workbook.Workbook?.Sheets ?? []).map((sheet) => [sheet.name, Number(sheet.Hidden) || 0]))
  const sheets: SpreadsheetSheet[] = []
  const warnings: string[] = []
  const distinctive = new Set<string>()
  let nonEmptyCellCount = 0
  let formulaWithoutValueCount = 0
  let formulaCount = 0
  let longUnwrappedCell = false

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    const hidden = (workbookSheetState.get(sheetName) ?? 0) > 0
    const cells: SpreadsheetCell[] = []
    let minRow = Number.POSITIVE_INFINITY
    let maxRow = -1
    let minColumn = Number.POSITIVE_INFINITY
    let maxColumn = -1

    const reference = worksheet?.["!ref"]
    if (worksheet && reference) {
      const range = XLSX.utils.decode_range(reference)
      if (range.e.r - range.s.r + 1 > maximumSpreadsheetRows) {
        throw new InvoiceDocumentPreparationError(
          "This spreadsheet contains too many rows for an invoice import. Remove unrelated data and try again.",
          413,
          "invoice_spreadsheet_too_large",
        )
      }
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let column = range.s.c; column <= range.e.c; column += 1) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined
          if (!cell) continue
          const value = cell.w ?? (cell.v === undefined || cell.v === null ? "" : XLSX.utils.format_cell(cell))
          const displayed = String(value ?? "").replace(/\r\n?/g, "\n").trim()
          const formulaWithoutValue = Boolean(cell.f) && (cell.v === undefined || cell.v === null || displayed === "")
          if (!displayed && !formulaWithoutValue) continue
          nonEmptyCellCount += 1
          if (nonEmptyCellCount > maximumSpreadsheetCells) {
            throw new InvoiceDocumentPreparationError(
              "This spreadsheet contains too much data for an invoice import. Remove unrelated tabs or rows and try again.",
              413,
              "invoice_spreadsheet_too_large",
            )
          }
          if (formulaWithoutValue) formulaWithoutValueCount += 1
          if (cell.f) formulaCount += 1
          const wrap = Boolean((cell.s as Record<string, any> | undefined)?.alignment?.wrapText)
          if (displayed.length > longCellThreshold && !wrap) longUnwrappedCell = true
          if (displayed.length >= 12 && distinctive.size < evidenceTextLimit) distinctive.add(displayed.slice(0, 600))
          cells.push({ row, column, text: displayed || "Formula result unavailable", wrap, formulaWithoutValue })
          minRow = Math.min(minRow, row)
          maxRow = Math.max(maxRow, row)
          minColumn = Math.min(minColumn, column)
          maxColumn = Math.max(maxColumn, column)
        }
      }
    }

    const status: InvoiceDocumentSheet["status"] = hidden ? "hidden" : cells.length ? "included" : "empty"
    const merges = ((worksheet?.["!merges"] ?? []) as XLSX.Range[]).map((merge) => ({
      startRow: merge.s.r,
      startColumn: merge.s.c,
      endRow: merge.e.r,
      endColumn: merge.e.c,
    }))
    sheets.push({
      name: sheetName,
      status,
      cells,
      merges,
      minRow: Number.isFinite(minRow) ? minRow : 0,
      maxRow: Math.max(maxRow, 0),
      minColumn: Number.isFinite(minColumn) ? minColumn : 0,
      maxColumn: Math.max(maxColumn, 0),
    })
  }

  const included = sheets.filter((sheet) => sheet.status === "included")
  const hiddenCount = sheets.filter((sheet) => sheet.status === "hidden").length
  const emptyCount = sheets.filter((sheet) => sheet.status === "empty").length
  if (!included.length) {
    throw new InvoiceDocumentPreparationError("No visible invoice data was found in this spreadsheet.", 422, "invoice_spreadsheet_empty")
  }
  if (hiddenCount) warnings.push(`${hiddenCount} hidden ${hiddenCount === 1 ? "sheet was" : "sheets were"} not included.`)
  if (emptyCount) warnings.push(`${emptyCount} empty ${emptyCount === 1 ? "sheet was" : "sheets were"} skipped.`)
  if (formulaWithoutValueCount) {
    warnings.push(`${formulaWithoutValueCount} ${formulaWithoutValueCount === 1 ? "formula has" : "formulas have"} no saved result and must be checked.`)
  }
  if (formulaCount) {
    warnings.push(`${formulaCount} ${formulaCount === 1 ? "formula was" : "formulas were"} not recalculated; only saved displayed values were included.`)
  }

  const onlySheet = included[0]
  const usedColumns = onlySheet ? onlySheet.maxColumn - onlySheet.minColumn + 1 : 0
  const safePrintArea = hasPrintArea(workbook, onlySheet?.name ?? "")
  const safeForDirectConversion = source.extension !== ".csv"
    && source.extension !== ".tsv"
    && included.length === 1
    && sheets.length === included.length
    && usedColumns <= directSpreadsheetColumns
    && safePrintArea
    && !longUnwrappedCell
    && formulaWithoutValueCount === 0

  if (!safeForDirectConversion) {
    warnings.unshift(`${fileName} was prepared in a content-safe layout so every visible cell can be reviewed.`)
  }
  return { sheets, warnings, distinctiveSourceText: [...distinctive], safeForDirectConversion }
}

function hasPrintArea(workbook: XLSX.WorkBook, sheetName: string) {
  return (workbook.Workbook?.Names ?? []).some((entry) => {
    if (!/_xlnm\.Print_Area$/i.test(entry.Name)) return false
    return entry.Sheet === workbook.SheetNames.indexOf(sheetName) || String(entry.Ref ?? "").includes(`${sheetName}!`)
  })
}

function spreadsheetHtml(inspection: SpreadsheetInspection, fileName: string) {
  const sections = inspection.sheets.filter((sheet) => sheet.status === "included").map((sheet) => renderSheet(sheet)).join("\n")
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${escapeHtml(fileName)}</title>
<style>
  @page { size: A3 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #292929; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 9pt; }
  section { break-before: page; }
  section:first-of-type { break-before: auto; }
  h1 { margin: 0 0 2mm; font-size: 15pt; font-weight: 600; }
  h2 { margin: 0 0 3mm; color: #5d5d5d; font-size: 8pt; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; break-inside: auto; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: .25pt solid #c8c8c8; padding: 1.5mm 1.8mm; text-align: start; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; line-height: 1.28; }
  th { background: #f2f2f2; font-weight: 600; }
  td.formula-missing { background: #fff7e8; color: #7a4b10; }
  .band + .band { margin-top: 7mm; break-before: page; }
</style>
</head>
<body>${sections}</body>
</html>`
}

function renderSheet(sheet: SpreadsheetSheet) {
  const bands = columnBands(sheet)
  return bands.map((columns, bandIndex) => {
    const cellMap = new Map(sheet.cells.map((cell) => [`${cell.row}:${cell.column}`, cell]))
    const rows = unique(sheet.cells.filter((cell) => columns.includes(cell.column)).map((cell) => cell.row)).sort((a, b) => a - b)
    const headerRow = detectHeaderRow(rows, columns, cellMap)
    const renderedRows = rows.map((row) => renderSpreadsheetRow(sheet, row, columns, cellMap, row === headerRow))
    const header = headerRow === null ? "" : renderedRows.splice(rows.indexOf(headerRow), 1)[0]
    const rangeLabel = columns.length ? `${XLSX.utils.encode_col(columns[0])}-${XLSX.utils.encode_col(columns.at(-1)!)}` : ""
    return `<section class="band"><h1>${escapeHtml(sheet.name)}</h1><h2>${bands.length > 1 ? `Part ${bandIndex + 1} of ${bands.length} - columns ${rangeLabel}` : "Visible spreadsheet content"}</h2><table>${header ? `<thead>${header}</thead>` : ""}<tbody>${renderedRows.join("")}</tbody></table></section>`
  }).join("\n")
}

function columnBands(sheet: SpreadsheetSheet) {
  const usedColumns = unique(sheet.cells.map((cell) => cell.column)).sort((a, b) => a - b)
  if (usedColumns.length <= 10) return [usedColumns]
  const anchors = usedColumns.slice(0, 2)
  const remaining = usedColumns.slice(2)
  const bands: number[][] = []
  for (let index = 0; index < remaining.length; index += 8) bands.push(unique([...anchors, ...remaining.slice(index, index + 8)]))
  return bands
}

function detectHeaderRow(rows: number[], columns: number[], cells: Map<string, SpreadsheetCell>) {
  for (const row of rows.slice(0, 10)) {
    const values = columns.map((column) => cells.get(`${row}:${column}`)?.text ?? "").filter(Boolean)
    const textValues = values.filter((value) => /[\p{L}]/u.test(value))
    if (values.length >= 2 && textValues.length / values.length >= 0.6) return row
  }
  return null
}

function renderSpreadsheetRow(
  sheet: SpreadsheetSheet,
  row: number,
  columns: number[],
  cells: Map<string, SpreadsheetCell>,
  header: boolean,
) {
  const tag = header ? "th" : "td"
  const rendered: string[] = []
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index]
    const covering = sheet.merges.find((merge) => row >= merge.startRow && row <= merge.endRow && column >= merge.startColumn && column <= merge.endColumn)
    if (covering && (row !== covering.startRow || column !== covering.startColumn)) continue
    const cell = cells.get(`${row}:${column}`)
    const includedMergedColumns = covering
      ? columns.filter((candidate) => candidate >= covering.startColumn && candidate <= covering.endColumn)
      : []
    const colspan = includedMergedColumns.length > 1 ? ` colspan="${includedMergedColumns.length}"` : ""
    const rowspan = covering && covering.endRow > covering.startRow ? ` rowspan="${covering.endRow - covering.startRow + 1}"` : ""
    const className = cell?.formulaWithoutValue ? ' class="formula-missing"' : ""
    rendered.push(`<${tag}${colspan}${rowspan}${className}>${escapeHtml(cell?.text ?? "")}</${tag}>`)
  }
  return `<tr>${rendered.join("")}</tr>`
}

function imageHtml(bytes: Uint8Array, mimeType: string, fileName: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(fileName)}</title><style>@page{size:A4;margin:10mm}html,body{margin:0}body{display:grid;min-height:calc(100vh - 20mm);place-items:center}img{display:block;max-width:100%;max-height:100%;object-fit:contain}</style></head><body><img alt="Invoice" src="data:${mimeType};base64,${base64(bytes)}"></body></html>`
}

async function imageToPdf(bytes: Uint8Array, mimeType: string) {
  try {
    const pdf = await PDFDocument.create()
    const image = mimeType === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    const portrait = image.height >= image.width
    const pageWidth = portrait ? 595.28 : 841.89
    const pageHeight = portrait ? 841.89 : 595.28
    const margin = 28.35
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height)
    const width = image.width * scale
    const height = image.height * scale
    const page = pdf.addPage([pageWidth, pageHeight])
    page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height })
    return await pdf.save({ useObjectStreams: false })
  } catch {
    throw new InvoiceDocumentPreparationError("This invoice image could not be prepared. Check the image and try again.", 422, "invoice_image_unreadable")
  }
}

async function convertWithCarbone(bytes: Uint8Array, fileName: string, converter: "L" | "C") {
  const response = await fetch(`${carboneBaseUrl()}/render/template?download=true`, {
    method: "POST",
    headers: {
      Authorization: carboneAuthorization(),
      "Content-Type": "application/json",
      "carbone-version": Deno.env.get("CARBONE_API_VERSION")?.trim() || "5",
      "User-Agent": "Multideck invoice document normalizer/2",
    },
    body: JSON.stringify({
      data: {},
      template: base64(bytes),
      convertTo: "pdf",
      converter,
      hardRefresh: true,
      reportName: safeReportName(fileName),
    }),
    signal: AbortSignal.timeout(carboneTimeout()),
  }).catch((error) => {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new InvoiceDocumentPreparationError("Preparing this invoice took too long. Try again or save it as a PDF.", 504, "invoice_conversion_timeout")
    }
    throw new InvoiceDocumentPreparationError("The invoice converter is temporarily unavailable. Try again.", 502, "invoice_conversion_unavailable")
  })
  if (!response.ok) {
    console.error("Invoice document conversion failed", { status: response.status })
    if ([400, 413, 415, 422].includes(response.status)) {
      throw new InvoiceDocumentPreparationError("This invoice file could not be converted. Save an unlocked copy or PDF and try again.", 422, "invoice_conversion_unreadable")
    }
    throw new InvoiceDocumentPreparationError("The invoice converter is temporarily unavailable. Try again.", 502, "invoice_conversion_failed")
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0)
  if (contentLength > MAX_PREPARED_INVOICE_BYTES) {
    throw new InvoiceDocumentPreparationError("The prepared invoice is too large. Remove unrelated pages or tabs and try again.", 413, "invoice_pdf_too_large")
  }
  const converted = new Uint8Array(await response.arrayBuffer())
  if (!converted.byteLength || converted.byteLength > MAX_PREPARED_INVOICE_BYTES || !startsWith(converted, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw new InvoiceDocumentPreparationError("The invoice converter returned an invalid PDF. Try again.", 502, "invoice_conversion_invalid_pdf")
  }
  return converted
}

async function validatedPdfPageCount(bytes: Uint8Array) {
  if (!bytes.byteLength || bytes.byteLength > MAX_PREPARED_INVOICE_BYTES || !startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw new InvoiceDocumentPreparationError("The prepared invoice is not a valid PDF.", 415, "invoice_pdf_invalid")
  }
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false })
    const pageCount = pdf.getPageCount()
    if (!pageCount) throw new Error("empty_pdf")
    if (pageCount > MAX_PREPARED_INVOICE_PAGES) {
      throw new InvoiceDocumentPreparationError(
        "This invoice creates more than 30 pages. Remove irrelevant pages or spreadsheet tabs and try again.",
        413,
        "invoice_pdf_too_many_pages",
      )
    }
    return pageCount
  } catch (error) {
    if (error instanceof InvoiceDocumentPreparationError) throw error
    throw new InvoiceDocumentPreparationError("Password-protected or damaged PDF invoices are not supported.", 415, "invoice_pdf_unreadable")
  }
}

function carboneAuthorization() {
  const explicit = Deno.env.get("CARBONE_AUTH_HEADER")?.trim()
  if (explicit) return explicit
  const username = Deno.env.get("CARBONE_USERNAME")
  const password = Deno.env.get("CARBONE_PASSWORD")
  if (username && password) return `Basic ${btoa(`${username}:${password}`)}`
  const token = Deno.env.get("CARBONE_API_TOKEN")?.trim()
  if (token) return `Bearer ${token}`
  throw new InvoiceDocumentPreparationError("Invoice import is unavailable for this workspace.", 503, "invoice_conversion_not_configured")
}

function carboneBaseUrl() {
  const configured = Deno.env.get("CARBONE_URL")?.trim().replace(/\/$/, "")
  if (!configured) throw new InvoiceDocumentPreparationError("Invoice import is unavailable for this workspace.", 503, "invoice_conversion_not_configured")
  const url = new URL(configured)
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new InvoiceDocumentPreparationError("Invoice import is unavailable for this workspace.", 503, "invoice_conversion_unsafe_url")
  }
  return url.toString().replace(/\/$/, "")
}

function carboneTimeout() {
  const configured = Number(Deno.env.get("CARBONE_TIMEOUT_MS") ?? carboneTimeoutMs)
  return Number.isFinite(configured) ? Math.max(5_000, Math.min(configured, 60_000)) : carboneTimeoutMs
}

function safeReportName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160) || "invoice"
}

function base64(bytes: Uint8Array) {
  let binary = ""
  for (let offset = 0; offset < bytes.byteLength; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!)
}

function unique(values: number[]) {
  return [...new Set(values)]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}

function normaliseEvidenceText(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim()
}

function distinctiveTokens(value: string) {
  return [...new Set(normaliseEvidenceText(value).split(" ").filter((token) => token.length >= 4))].slice(0, 24)
}
