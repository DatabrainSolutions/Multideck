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
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0])
  const cases: Array<[string, string, Uint8Array]> = [
    ["invoice.pdf", "application/pdf", textBytes.encode("%PDF-1.7")],
    ["invoice.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip("xl/ [Content_Types].xml")],
    ["invoice.xls", "application/vnd.ms-excel", ole],
    ["invoice.csv", "text/csv", textBytes.encode("reference,value\nINV-1,10")],
    ["invoice.tsv", "text/tab-separated-values", textBytes.encode("reference\tvalue\nINV-1\t10")],
    ["invoice.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", zip("word/ [Content_Types].xml")],
    ["invoice.doc", "application/msword", ole],
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
})

Deno.test("preserves quoted CSV newlines and rejects mismatched, encrypted and macro sources before conversion", async () => {
  const csv = new TextEncoder().encode('sku,description,value\nA-1,"first line\nsecond line",10\n')
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
    assertStringIncludes(renderedHtml, "first line\nsecond line")
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
