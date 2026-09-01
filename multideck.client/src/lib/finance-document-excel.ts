import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import type { FinanceDocumentLine } from "@/components/multideck/finance-document-line-editor"

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_EXPANDED_BYTES = 20 * 1024 * 1024
const MAX_IMPORT_LINES = 100

export type ImportedFinanceDocumentLine = Omit<FinanceDocumentLine, "id" | "taxRatePercent"> & { taxRatePercent?: string }

type WorkbookInput = {
  title: string
  documentType: string
  currencyCode: string
  lines: FinanceDocumentLine[]
}

function xml(value: unknown) {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[character] ?? character)
}

function inlineCell(reference: string, value: string | number, style = 4) {
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
}

function numberCell(reference: string, value: number, style = 5, formula?: string) {
  return `<c r="${reference}" s="${style}">${formula ? `<f>${xml(formula)}</f>` : ""}<v>${Number.isFinite(value) ? value : 0}</v></c>`
}

function safeFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "finance-document"
}

export function buildFinanceDocumentWorkbook({ title, documentType, currencyCode, lines }: WorkbookInput) {
  const now = new Date().toISOString()
  const headers = ["Line no.", "Charge code", "Description", "Line type", "Quantity", "Unit amount", "Tax treatment", "Tax rate %", "Net amount", "Tax amount", "Gross amount"]
  const dataRows = lines.map((line, index) => {
    const row = index + 5
    const quantity = Number(line.quantity) || 0
    const unitAmount = Number(line.unitAmount) || 0
    const taxRate = Number(line.taxRatePercent) || 0
    const net = quantity * unitAmount
    const tax = net * taxRate / 100
    return `<row r="${row}">${numberCell(`A${row}`, index + 1, 4)}${inlineCell(`B${row}`, line.chargeCode)}${inlineCell(`C${row}`, line.description)}${inlineCell(`D${row}`, line.lineType)}${numberCell(`E${row}`, quantity)}${numberCell(`F${row}`, unitAmount)}${inlineCell(`G${row}`, line.taxCode)}${numberCell(`H${row}`, taxRate)}${numberCell(`I${row}`, net, 5, `E${row}*F${row}`)}${numberCell(`J${row}`, tax, 5, `I${row}*H${row}/100`)}${numberCell(`K${row}`, net + tax, 5, `I${row}+J${row}`)}</row>`
  }).join("")
  const lastRow = Math.max(5, lines.length + 4)
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/><col min="3" max="3" width="42" customWidth="1"/><col min="4" max="4" width="16" customWidth="1"/><col min="5" max="5" width="12" customWidth="1"/><col min="6" max="6" width="16" customWidth="1"/><col min="7" max="7" width="20" customWidth="1"/><col min="8" max="8" width="13" customWidth="1"/><col min="9" max="11" width="17" customWidth="1"/></cols><sheetData><row r="1" ht="28" customHeight="1">${inlineCell("A1", title, 1)}</row><row r="2" ht="22" customHeight="1">${inlineCell("A2", `${documentType} · ${currencyCode} · Edit input columns only; calculated amount columns are replaced when imported.`, 2)}</row><row r="4" ht="24" customHeight="1">${headers.map((header, index) => inlineCell(`${String.fromCharCode(65 + index)}4`, header, 3)).join("")}</row>${dataRows}</sheetData><autoFilter ref="A4:K${lastRow}"/><mergeCells count="2"><mergeCell ref="A1:K1"/><mergeCell ref="A2:K2"/></mergeCells><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "docProps/app.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Multideck</Application></Properties>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>Multideck</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Document lines" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="18"/><color rgb="FF122321"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F1EF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF244D48"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7E0DE"/></left><right style="thin"><color rgb="FFD7E0DE"/></right><top style="thin"><color rgb="FFD7E0DE"/></top><bottom style="thin"><color rgb="FFD7E0DE"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  }
  return zipSync(files, { level: 6 })
}

export function downloadFinanceDocumentWorkbook(input: WorkbookInput) {
  const bytes = buildFinanceDocumentWorkbook(input)
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${safeFileName(input.title)}.xlsx`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return anchor.download
}

function parseXml(value: Uint8Array, label: string) {
  const parsed = new DOMParser().parseFromString(strFromU8(value), "application/xml")
  if (parsed.querySelector("parsererror")) throw new Error(`${label} is not valid XML.`)
  return parsed
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? ""
  return [...letters].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1
}

function normaliseHeader(value: string) {
  return value.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ")
}

function numeric(value: string, label: string, row: number) {
  const compact = value.trim().replace(/\s/g, "")
  const normalised = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact) ? compact.replace(/,/g, "") : compact.replace(",", ".")
  const parsed = Number(normalised)
  if (!Number.isFinite(parsed)) throw new Error(`${label} on spreadsheet row ${row} is not a valid number.`)
  return parsed
}

export async function parseFinanceDocumentWorkbook(file: File): Promise<ImportedFinanceDocumentLine[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error("The Excel file must be 5 MB or smaller.")
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Choose an Excel .xlsx file.")

  let archive: Record<string, Uint8Array>
  let expandedBytes = 0
  let archiveTooLarge = false
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) => {
        const required = entry.name === "xl/workbook.xml"
          || entry.name === "xl/_rels/workbook.xml.rels"
          || entry.name === "xl/sharedStrings.xml"
          || entry.name.startsWith("xl/worksheets/")
        if (!required) return false
        expandedBytes += entry.originalSize
        if (entry.originalSize > MAX_EXPANDED_BYTES || expandedBytes > MAX_EXPANDED_BYTES) {
          archiveTooLarge = true
          return false
        }
        return true
      },
    })
  } catch {
    throw new Error("The Excel file could not be opened. It may be damaged or password protected.")
  }
  if (archiveTooLarge) throw new Error("The Excel workbook is too large when expanded.")

  const workbookBytes = archive["xl/workbook.xml"]
  const relationshipBytes = archive["xl/_rels/workbook.xml.rels"]
  if (!workbookBytes || !relationshipBytes) throw new Error("The Excel file does not contain a readable workbook.")
  const workbook = parseXml(workbookBytes, "Workbook")
  const firstSheet = workbook.getElementsByTagNameNS("*", "sheet")[0]
  const relationshipId = [...(firstSheet?.attributes ?? [])].find((attribute) => attribute.localName === "id")?.value
  const relationships = parseXml(relationshipBytes, "Workbook relationships")
  const target = [...relationships.getElementsByTagNameNS("*", "Relationship")].find((relationship) => relationship.getAttribute("Id") === relationshipId)?.getAttribute("Target")
  const sheetPath = target ? `xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}` : "xl/worksheets/sheet1.xml"
  const sheetBytes = archive[sheetPath]
  if (!sheetBytes) throw new Error("The first Excel worksheet could not be read.")

  const sharedStrings = archive["xl/sharedStrings.xml"]
    ? [...parseXml(archive["xl/sharedStrings.xml"], "Shared strings").getElementsByTagNameNS("*", "si")].map((item) => [...item.getElementsByTagNameNS("*", "t")].map((node) => node.textContent ?? "").join(""))
    : []
  const sheet = parseXml(sheetBytes, "Worksheet")
  const rows = [...sheet.getElementsByTagNameNS("*", "row")].map((row) => {
    const values: string[] = []
    for (const cell of [...row.getElementsByTagNameNS("*", "c")]) {
      const index = columnIndex(cell.getAttribute("r") ?? "")
      const type = cell.getAttribute("t")
      const raw = cell.getElementsByTagNameNS("*", "v")[0]?.textContent ?? ""
      values[index] = type === "s" ? sharedStrings[Number(raw)] ?? "" : type === "inlineStr" ? [...cell.getElementsByTagNameNS("*", "t")].map((node) => node.textContent ?? "").join("") : raw
    }
    return { number: Number(row.getAttribute("r")) || 0, values }
  })

  const aliases = {
    chargeCode: ["charge code", "product code", "item code", "item number", "code"],
    description: ["description", "item description", "name"],
    lineType: ["line type", "type"],
    quantity: ["quantity", "qty"],
    unitAmount: ["unit amount", "unit price", "price", "base price"],
    taxCode: ["tax treatment", "tax code", "vat code", "tax"],
    taxRatePercent: ["tax rate %", "tax rate", "vat rate %", "vat %"],
  } as const
  const headerRow = rows.slice(0, 20).find((row) => {
    const headers = row.values.map(normaliseHeader)
    return aliases.description.some((alias) => headers.includes(alias)) && aliases.quantity.some((alias) => headers.includes(alias)) && aliases.unitAmount.some((alias) => headers.includes(alias))
  })
  if (!headerRow) throw new Error("The first worksheet needs Description, Quantity and Unit amount columns.")
  const headers = headerRow.values.map(normaliseHeader)
  const indexFor = (options: readonly string[]) => options.map((option) => headers.indexOf(option)).find((index) => index >= 0) ?? -1
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, indexFor(values)])) as Record<keyof typeof aliases, number>
  const imported: ImportedFinanceDocumentLine[] = []

  for (const row of rows.filter((candidate) => candidate.number > headerRow.number)) {
    const read = (key: keyof typeof aliases) => indexes[key] >= 0 ? (row.values[indexes[key]] ?? "").trim() : ""
    const description = read("description")
    const quantityValue = read("quantity")
    const unitAmountValue = read("unitAmount")
    if (!description && !quantityValue && !unitAmountValue && !read("chargeCode")) continue
    if (!description) throw new Error(`Description is required on spreadsheet row ${row.number}.`)
    const quantity = numeric(quantityValue, "Quantity", row.number)
    const unitAmount = numeric(unitAmountValue, "Unit amount", row.number)
    if (quantity <= 0) throw new Error(`Quantity on spreadsheet row ${row.number} must be greater than zero.`)
    if (unitAmount < 0) throw new Error(`Unit amount on spreadsheet row ${row.number} cannot be negative.`)
    const lineTypeValue = normaliseHeader(read("lineType"))
    imported.push({
      chargeCode: read("chargeCode").toUpperCase() || "ADHOC",
      jobCostingLineId: null,
      description,
      lineType: lineTypeValue === "ancillary" ? "ancillary" : "service",
      quantity: String(quantity),
      unitAmount: String(unitAmount),
      taxCode: read("taxCode").toUpperCase(),
      taxRatePercent: read("taxRatePercent") || undefined,
    })
    if (imported.length > MAX_IMPORT_LINES) throw new Error(`Excel import supports up to ${MAX_IMPORT_LINES} document lines at a time.`)
  }
  if (!imported.length) throw new Error("The first Excel worksheet does not contain any document lines.")
  return imported
}
