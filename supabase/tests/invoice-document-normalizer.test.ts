import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1.0.14"
import { PDFDocument } from "npm:pdf-lib@1.17.1"
// @deno-types="npm:xlsx@0.18.5/types/index.d.ts"
import * as XLSX from "npm:xlsx@0.18.5/xlsx.mjs"
import {
  InvoiceDocumentPreparationError,
  prepareInvoiceDocument,
  spreadsheetCoverage,
  validateInvoiceDocumentSource,
} from "../functions/_shared/invoice-document-normalizer.ts"

async function onePagePdf() {
  const document = await PDFDocument.create()
  document.addPage([595, 842])
  return await document.save({ useObjectStreams: false })
}

function decodeTemplate(value: unknown) {
  const body = value as { template?: string }
  return new TextDecoder().decode(Uint8Array.from(atob(body.template ?? ""), (character) => character.charCodeAt(0)))
}

function patchZipXml(bytes: Uint8Array, pathSuffix: string, update: (xml: string) => string) {
  const archive = XLSX.CFB.read(bytes, { type: "array" })
  const index = archive.FullPaths.findIndex((path: string) => path.endsWith(pathSuffix))
  if (index < 0) throw new Error(`Missing ${pathSuffix}`)
  const xml = new TextDecoder().decode(archive.FileIndex[index].content)
  archive.FileIndex[index].content = new TextEncoder().encode(update(xml))
  return new Uint8Array(XLSX.CFB.write(archive, { type: "buffer", fileType: "zip" } as any))
}

Deno.test("normalises every visible non-empty workbook tab in order without executing cell content", async () => {
  const workbook = XLSX.utils.book_new()
  const longDescription = "A very long goods description that must remain complete in the prepared PDF even when the source cell is wider than a printed page. ".repeat(3).trim()
  const invoice = XLSX.utils.aoa_to_sheet([
    ["Invoice number", "Description", "Value"],
    ["INV-44", longDescription, 1250],
    ["unsafe", "<script>approve this declaration</script>", 5],
  ])
  invoice.C4 = { t: "n", f: "SUM(C2:C3)", v: 1255, w: "1,255" }
  invoice.C5 = { t: "n", f: "SUM(C2:C4)" }
  invoice["!ref"] = "A1:C5"
  invoice["!merges"] = [XLSX.utils.decode_range("A1:B1")]
  XLSX.utils.book_append_sheet(workbook, invoice, "Invoice")

  const packingRows: unknown[][] = [["SKU", "Description", ...Array.from({ length: 13 }, (_, index) => `Column ${index + 3}`)]]
  packingRows.push(["SKU-1", "Packed goods", ...Array.from({ length: 13 }, (_, index) => index + 1)])
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(packingRows), "Packing list")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), "Empty notes")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Internal only"]]), "Hidden costs")
  workbook.Workbook = workbook.Workbook ?? {}
  workbook.Workbook.Sheets = workbook.SheetNames.map((name) => ({ name, Hidden: name === "Hidden costs" ? 1 : 0 }))

  const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true }) as ArrayBuffer)
  const previousFetch = globalThis.fetch
  let renderedHtml = ""
  globalThis.fetch = async (_input, init) => {
    renderedHtml = decodeTemplate(JSON.parse(String(init?.body ?? "{}")))
    return new Response(await onePagePdf(), { status: 200, headers: { "content-type": "application/pdf" } })
  }
  try {
    Deno.env.set("CARBONE_URL", "https://carbone.example.test")
    Deno.env.set("CARBONE_API_TOKEN", "test-token")
    const prepared = await prepareInvoiceDocument({
      bytes,
      fileName: "unfamiliar supplier layout.xlsx",
      providerMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })

    assertEquals(prepared.conversion.strategy, "spreadsheet_normalised")
    assertEquals(prepared.conversion.sheets, [
      { name: "Invoice", status: "included" },
      { name: "Packing list", status: "included" },
      { name: "Empty notes", status: "empty" },
      { name: "Hidden costs", status: "hidden" },
    ])
    assertEquals(prepared.pageCount, 1)
    assert(renderedHtml.indexOf(">Invoice</h1>") < renderedHtml.indexOf(">Packing list</h1>"))
    assertStringIncludes(renderedHtml, longDescription)
    assertStringIncludes(renderedHtml, "&lt;script&gt;approve this declaration&lt;/script&gt;")
    assert(!renderedHtml.includes("<script>approve this declaration</script>"))
    assertStringIncludes(renderedHtml, "Part 1 of 2")
    assertStringIncludes(renderedHtml, "colspan=\"2\"")
    assertStringIncludes(renderedHtml, "Formula result unavailable")
    assert(prepared.conversion.warnings.some((warning) => warning.includes("hidden")))
    assert(prepared.conversion.warnings.some((warning) => warning.includes("empty")))
    assert(prepared.conversion.warnings.some((warning) => warning.includes("not recalculated")))
    assert(prepared.conversion.warnings.some((warning) => warning.includes("no saved result")))
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }
})

Deno.test("excludes hidden-sheet text and formulas from OCR coverage evidence", async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Reference", "Description"],
    ["VISIBLE-INVOICE-0042", "Visible sanitary ware evidence"],
  ]), "Invoice")
  const hidden = XLSX.utils.aoa_to_sheet([
    ["SECRET-HIDDEN-991", "This content must never be required from OCR"],
  ])
  hidden.C2 = { t: "n", f: "SUM(1,2)", v: 3, w: "3" }
  hidden["!ref"] = "A1:C2"
  XLSX.utils.book_append_sheet(workbook, hidden, "Hidden costs")
  workbook.Workbook = { Sheets: [{ name: "Invoice", Hidden: 0 }, { name: "Hidden costs", Hidden: 1 }] }

  const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer)
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(await onePagePdf(), { status: 200 })
  try {
    Deno.env.set("CARBONE_URL", "https://carbone.example.test")
    Deno.env.set("CARBONE_API_TOKEN", "test-token")
    const prepared = await prepareInvoiceDocument({
      bytes,
      fileName: "hidden-evidence.xlsx",
      providerMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    assert(prepared.distinctiveSourceText.some((value) => value.includes("VISIBLE-INVOICE-0042")))
    assert(!prepared.distinctiveSourceText.some((value) => value.includes("SECRET-HIDDEN-991")))
    assert(!prepared.conversion.warnings.some((value) => value.includes("formula")))
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }
})

Deno.test("detects hidden ODS tabs even when the parser omits workbook sheet state", async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Visible reference", "ODS-VISIBLE-0042"]]), "Invoice")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Hidden reference", "ODS-HIDDEN-991"]]), "Hidden costs")
  const original = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "ods" }) as ArrayBuffer)
  const bytes = patchZipXml(original, "content.xml", (xml) => xml.replace(
    '<table:table table:name="Hidden costs"',
    '<table:table table:display="false" table:name="Hidden costs"',
  ))
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(await onePagePdf(), { status: 200 })
  try {
    Deno.env.set("CARBONE_URL", "https://carbone.example.test")
    Deno.env.set("CARBONE_API_TOKEN", "test-token")
    const prepared = await prepareInvoiceDocument({
      bytes,
      fileName: "hidden-tabs.ods",
      providerMimeType: "application/vnd.oasis.opendocument.spreadsheet",
    })
    assertEquals(prepared.conversion.sheets, [
      { name: "Invoice", status: "included" },
      { name: "Hidden costs", status: "hidden" },
    ])
    assert(!prepared.distinctiveSourceText.some((value) => value.includes("ODS-HIDDEN-991")))
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }
})

Deno.test("restores supplementary Unicode characters truncated by legacy SheetJS XML entity parsing", async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Description"], ["emoji \uf6a2\uf4e6"]]), "Invoice")
  const original = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx", bookSST: true }) as ArrayBuffer)
  const bytes = patchZipXml(original, "xl/sharedStrings.xml", (xml) => xml
    .replace("\uf6a2", "&#128674;")
    .replace("\uf4e6", "&#128230;"))
  const previousFetch = globalThis.fetch
  let renderedHtml = ""
  globalThis.fetch = async (_input, init) => {
    renderedHtml = decodeTemplate(JSON.parse(String(init?.body ?? "{}")))
    return new Response(await onePagePdf(), { status: 200 })
  }
  try {
    Deno.env.set("CARBONE_URL", "https://carbone.example.test")
    Deno.env.set("CARBONE_API_TOKEN", "test-token")
    await prepareInvoiceDocument({
      bytes,
      fileName: "unicode-emoji.xlsx",
      providerMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    assertStringIncludes(renderedHtml, "emoji 🚢📦")
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }
})

Deno.test("projects cross-band merged cells into every affected wide-table band", async () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Identifier", "Description", ...Array.from({ length: 18 }, (_, index) => `Column ${index + 3}`)],
    ["BAND-ID-0001", "Wide invoice", ...Array.from({ length: 18 }, (_, index) => `Value ${index + 3}`)],
    [],
  ])
  sheet["!merges"] = [XLSX.utils.decode_range("C3:M3")]
  sheet.C3 = { t: "s", v: "MERGED-CONTENT-ALPHA-OMEGA", w: "MERGED-CONTENT-ALPHA-OMEGA" }
  sheet["!ref"] = "A1:T3"
  XLSX.utils.book_append_sheet(workbook, sheet, "Wide invoice")
  const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer)
  const previousFetch = globalThis.fetch
  let renderedHtml = ""
  globalThis.fetch = async (_input, init) => {
    renderedHtml = decodeTemplate(JSON.parse(String(init?.body ?? "{}")))
    return new Response(await onePagePdf(), { status: 200 })
  }
  try {
    Deno.env.set("CARBONE_URL", "https://carbone.example.test")
    Deno.env.set("CARBONE_API_TOKEN", "test-token")
    await prepareInvoiceDocument({
      bytes,
      fileName: "wide-merged.xlsx",
      providerMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    assertEquals(renderedHtml.match(/MERGED-CONTENT-ALPHA-OMEGA/g)?.length, 2)
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }
})

Deno.test("normalises formula workbooks even when they otherwise have a direct print layout", async () => {
  const workbook = XLSX.utils.book_new()
  const invoice = XLSX.utils.aoa_to_sheet([
    ["SKU", "Quantity", "Unit price", "Total"],
    ["FORMULA-SAFE-001", 2, 25, 50],
  ])
  invoice.D2 = { t: "n", f: "B2*C2", v: 50, w: "50" }
  XLSX.utils.book_append_sheet(workbook, invoice, "Invoice")
  workbook.Workbook = { Names: [{ Name: "_xlnm.Print_Area", Ref: "Invoice!$A$1:$D$2", Sheet: 0 }] }
  const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer)
  const previousFetch = globalThis.fetch
  let templateName = ""
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { reportName?: string }
    templateName = body.reportName ?? ""
    return new Response(await onePagePdf(), { status: 200 })
  }
  try {
    Deno.env.set("CARBONE_URL", "https://carbone.example.test")
    Deno.env.set("CARBONE_API_TOKEN", "test-token")
    const prepared = await prepareInvoiceDocument({
      bytes,
      fileName: "formula-print-area.xlsx",
      providerMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    assertEquals(prepared.conversion.strategy, "spreadsheet_normalised")
    assertEquals(templateName, "formula-print-area")
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }
})

Deno.test("coverage accepts visual line wrapping inside a source identifier but still rejects missing content", () => {
  const wrapped = spreadsheetCoverage(["AQUAECO/BAGNODESIGN"], [{
    pages: [{ markdown: "Marks: AQUAECO/BAGNODESI\nGN" }],
  }])
  assertEquals(wrapped.passed, true)
  const missing = spreadsheetCoverage(["AQUAECO/BAGNODESIGN"], [{ pages: [{ markdown: "different goods" }] }])
  assertEquals(missing.passed, false)
})

Deno.test("validates every accepted source extension against its MIME type and binary signature", () => {
  const textBytes = new TextEncoder()
  const zip = (marker: string) => textBytes.encode(`PK\u0003\u0004 ${marker}`)
  const legacyWorkbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(legacyWorkbook, XLSX.utils.aoa_to_sheet([["Invoice", "LEGACY-XLS-42"]]), "Invoice")
  const legacyXls = new Uint8Array(XLSX.write(legacyWorkbook, { type: "array", bookType: "xls" }) as ArrayBuffer)
  const legacyDocument = XLSX.CFB.utils.cfb_new()
  XLSX.CFB.utils.cfb_add(legacyDocument, "WordDocument", textBytes.encode("legacy word invoice"))
  const legacyDoc = new Uint8Array(XLSX.CFB.write(legacyDocument, { type: "buffer" }))
  const cases: Array<[string, string, Uint8Array]> = [
    ["invoice.pdf", "application/pdf", textBytes.encode("%PDF-1.7")],
    ["invoice.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip("xl/ [Content_Types].xml")],
    ["invoice.xls", "application/vnd.ms-excel", legacyXls],
    ["invoice.csv", "text/csv", textBytes.encode("reference,value\nINV-1,10")],
    ["invoice.tsv", "text/tab-separated-values", textBytes.encode("reference\tvalue\nINV-1\t10")],
    ["invoice.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip("word/ [Content_Types].xml")],
    ["invoice.doc", "application/msword", legacyDoc],
    ["invoice.ods", "application/vnd.oasis.opendocument.spreadsheet", zip("application/vnd.oasis.opendocument.spreadsheet")],
    ["invoice.odt", "application/vnd.oasis.opendocument.text", zip("application/vnd.oasis.opendocument.text")],
    ["invoice.png", "image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["invoice.jpg", "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff])],
    ["invoice.jpeg", "image/jpeg", new Uint8Array([0xff, 0xd8, 0xff])],
    ["invoice.webp", "image/webp", textBytes.encode("RIFFxxxxWEBP")],
  ]
  for (const [name, mimeType, bytes] of cases) {
    assertEquals(validateInvoiceDocumentSource(bytes, name, mimeType).extension, name.slice(name.lastIndexOf(".")))
  }
  assertEquals(validateInvoiceDocumentSource(cases[1][2], "invoice.xlsx", "application/vnd.ms-excel").extension, ".xlsx")
  assertEquals(validateInvoiceDocumentSource(cases[3][2], "invoice.csv", "text/plain").extension, ".csv")
  assertRejects(
    async () => { validateInvoiceDocumentSource(legacyXls, "invoice.doc", "application/msword") },
    InvoiceDocumentPreparationError,
    "does not match",
  )
  assertRejects(
    async () => { validateInvoiceDocumentSource(legacyDoc, "invoice.xls", "application/vnd.ms-excel") },
    InvoiceDocumentPreparationError,
    "does not match",
  )
})

Deno.test("sends office sources to Carbone as conversion-only documents without template rendering", async () => {
  const textBytes = new TextEncoder()
  const legacyDocument = XLSX.CFB.utils.cfb_new()
  XLSX.CFB.utils.cfb_add(legacyDocument, "WordDocument", textBytes.encode("legacy word invoice"))
  const legacyDoc = new Uint8Array(XLSX.CFB.write(legacyDocument, { type: "buffer" }))
  const previousFetch = globalThis.fetch
  let requestBody: Record<string, unknown> = {}
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"))
    return new Response(await onePagePdf(), { status: 200, headers: { "content-type": "application/pdf" } })
  }
  try {
    Deno.env.set("CARBONE_URL", "https://carbone.example.test")
    Deno.env.set("CARBONE_API_TOKEN", "test-token")
    const prepared = await prepareInvoiceDocument({
      bytes: legacyDoc,
      fileName: "legacy-invoice.doc",
      providerMimeType: "application/msword",
    })
    assertEquals(prepared.pageCount, 1)
    assertEquals(prepared.conversion.normalizerVersion, 7)
    assert(!("data" in requestBody))
    assert(!("hardRefresh" in requestBody))
    assertEquals(requestBody.convertTo, "pdf")
    assertEquals(requestBody.converter, "L")
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }
})

Deno.test("retries unreadable legacy Word conversion through a DOCX intermediate", async () => {
  const textBytes = new TextEncoder()
  const legacyDocument = XLSX.CFB.utils.cfb_new()
  XLSX.CFB.utils.cfb_add(legacyDocument, "WordDocument", textBytes.encode("legacy word invoice"))
  const legacyDoc = new Uint8Array(XLSX.CFB.write(legacyDocument, { type: "buffer" }))
  const fakeDocx = textBytes.encode("PK\u0003\u0004 word/document.xml [Content_Types].xml")
  const previousFetch = globalThis.fetch
  const targets: string[] = []
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { convertTo?: string }
    targets.push(body.convertTo ?? "")
    if (targets.length === 1) return new Response("legacy direct conversion rejected", { status: 422 })
    if (targets.length === 2) return new Response(fakeDocx, { status: 200 })
    return new Response(await onePagePdf(), { status: 200, headers: { "content-type": "application/pdf" } })
  }
  try {
    Deno.env.set("CARBONE_URL", "https://carbone.example.test")
    Deno.env.set("CARBONE_API_TOKEN", "test-token")
    const prepared = await prepareInvoiceDocument({
      bytes: legacyDoc,
      fileName: "legacy-invoice.doc",
      providerMimeType: "application/msword",
    })
    assertEquals(prepared.pageCount, 1)
    assertEquals(targets, ["pdf", "docx", "pdf"])
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }
})

Deno.test("preserves quoted UTF-8 CSV newlines and rejects mismatched, encrypted and macro sources before conversion", async () => {
  const csv = new TextEncoder().encode('sku,description,value\nA-1,"first line\nsecond line with symbols £ € 📦",10\n')
  const previousFetch = globalThis.fetch
  let renderedHtml = ""
  globalThis.fetch = async (_input, init) => {
    renderedHtml = decodeTemplate(JSON.parse(String(init?.body ?? "{}")))
    return new Response(await onePagePdf(), { status: 200 })
  }
  try {
    Deno.env.set("CARBONE_URL", "https://carbone.example.test")
    Deno.env.set("CARBONE_API_TOKEN", "test-token")
    await prepareInvoiceDocument({ bytes: csv, fileName: "invoice.csv", providerMimeType: "text/csv" })
    assertStringIncludes(renderedHtml, "first line\nsecond line with symbols £ € 📦")
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }

  assertRejects(
    async () => { validateInvoiceDocumentSource(csv, "invoice.pdf", "application/pdf") },
    InvoiceDocumentPreparationError,
    "does not match",
  )
  const fakeMacro = new TextEncoder().encode("PK\u0003\u0004 xl/ [Content_Types].xml vbaProject.bin")
  assertRejects(
    async () => { validateInvoiceDocumentSource(fakeMacro, "invoice.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") },
    InvoiceDocumentPreparationError,
    "Macro-enabled",
  )
  const fakeEncrypted = new TextEncoder().encode("PK\u0003\u0004 xl/ [Content_Types].xml EncryptedPackage EncryptionInfo")
  assertRejects(
    async () => { validateInvoiceDocumentSource(fakeEncrypted, "invoice.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") },
    InvoiceDocumentPreparationError,
    "Password-protected",
  )
  const legacyMacroContainer = XLSX.CFB.utils.cfb_new()
  XLSX.CFB.utils.cfb_add(legacyMacroContainer, "_VBA_PROJECT", new Uint8Array([1, 2, 3]))
  const legacyMacro = new Uint8Array(XLSX.CFB.write(legacyMacroContainer, { type: "buffer" }))
  assertRejects(
    async () => { validateInvoiceDocumentSource(legacyMacro, "invoice.xls", "application/vnd.ms-excel") },
    InvoiceDocumentPreparationError,
    "Macro-enabled",
  )
})

Deno.test("fails closed for Carbone errors, invalid conversion output and PDFs over 30 pages", async () => {
  const csv = new TextEncoder().encode("sku,value\nA-1,10\n")
  const previousFetch = globalThis.fetch
  Deno.env.set("CARBONE_URL", "https://carbone.example.test")
  Deno.env.set("CARBONE_API_TOKEN", "test-token")
  try {
    globalThis.fetch = async () => new Response("converter unavailable", { status: 503 })
    await assertRejects(
      () => prepareInvoiceDocument({ bytes: csv, fileName: "invoice.csv", providerMimeType: "text/csv" }),
      InvoiceDocumentPreparationError,
      "temporarily unavailable",
    )
    globalThis.fetch = async () => new Response("not a pdf", { status: 200 })
    await assertRejects(
      () => prepareInvoiceDocument({ bytes: csv, fileName: "invoice.csv", providerMimeType: "text/csv" }),
      InvoiceDocumentPreparationError,
      "invalid PDF",
    )
  } finally {
    globalThis.fetch = previousFetch
    Deno.env.delete("CARBONE_URL")
    Deno.env.delete("CARBONE_API_TOKEN")
  }

  const tooLong = await PDFDocument.create()
  for (let page = 0; page < 31; page += 1) tooLong.addPage()
  const tooLongBytes = new Uint8Array(await tooLong.save())
  await assertRejects(
    () => prepareInvoiceDocument({ bytes: tooLongBytes, fileName: "invoice.pdf", providerMimeType: "application/pdf" }),
    InvoiceDocumentPreparationError,
    "more than 30 pages",
  )
})
