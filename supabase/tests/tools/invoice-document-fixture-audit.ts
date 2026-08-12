import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.14"
import { PDFDocument } from "npm:pdf-lib@1.17.1"
import {
  type InvoiceConversionStrategy,
  prepareInvoiceDocument,
} from "../../functions/_shared/invoice-document-normalizer.ts"

type FixtureExpectation = {
  expectedStrategy: InvoiceConversionStrategy
  sheets?: string[]
  pages?: number
  requiredText?: string[]
}

const fixtureDirectory = Deno.args[0]
if (!fixtureDirectory) throw new Error("Usage: deno run --allow-env --allow-read --allow-write invoice-document-fixture-audit.ts <fixture-directory>")

const fixtureRoot = await Deno.realPath(fixtureDirectory)
const manifest = JSON.parse(await Deno.readTextFile(`${fixtureRoot}/manifest.json`)) as Record<string, FixtureExpectation>
const htmlDirectory = `${fixtureRoot}/audit-html`
await Deno.mkdir(htmlDirectory, { recursive: true })
const preparedDirectory = `${fixtureRoot}/audit-prepared`
await Deno.mkdir(preparedDirectory, { recursive: true })

const mimeTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}

const onePage = await PDFDocument.create()
onePage.addPage([1_190, 842])
const onePageBytes = new Uint8Array(await onePage.save({ useObjectStreams: false }))
const previousFetch = globalThis.fetch
Deno.env.set("CARBONE_URL", "https://carbone.fixture.test")
Deno.env.set("CARBONE_API_TOKEN", "fixture-token")

try {
  for (const [fileName, expectation] of Object.entries(manifest)) {
    const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ""
    let renderedHtml = ""
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { template?: string }
      const template = Uint8Array.from(atob(body.template ?? ""), (character) => character.charCodeAt(0))
      if (extension === ".csv" || extension === ".tsv" || extension === ".xlsx" || extension === ".xls" || extension === ".ods") {
        renderedHtml = new TextDecoder().decode(template)
      }
      return new Response(onePageBytes, { status: 200, headers: { "content-type": "application/pdf" } })
    }

    const prepared = await prepareInvoiceDocument({
      bytes: await Deno.readFile(`${fixtureRoot}/${fileName}`),
      fileName,
      providerMimeType: mimeTypes[extension],
    })
    assertEquals(prepared.conversion.strategy, expectation.expectedStrategy, `${fileName}: conversion strategy`)
    if (expectation.pages) assertEquals(prepared.pageCount, expectation.pages, `${fileName}: page count`)
    if ([".pdf", ".png", ".jpg", ".jpeg"].includes(extension)) {
      await Deno.writeFile(`${preparedDirectory}/${fileName}.pdf`, prepared.pdfBytes)
    }
    if (expectation.sheets) {
      assertEquals(
        prepared.conversion.sheets.filter((sheet) => sheet.status === "included").map((sheet) => sheet.name),
        expectation.sheets,
        `${fileName}: included sheets`,
      )
      if (prepared.conversion.strategy === "spreadsheet_normalised") {
        for (const sheet of expectation.sheets) assertStringIncludes(renderedHtml, escapeHtml(sheet), `${fileName}: rendered sheet ${sheet}`)
        for (const value of expectation.requiredText ?? []) {
          assertStringIncludes(renderedHtml, escapeHtml(value), `${fileName}: rendered source text ${value.slice(0, 40)}`)
        }
        if (renderedHtml.includes("<script>malicious-looking") || renderedHtml.includes("<script>apply declaration")) {
          throw new Error(`${fileName}: unescaped script-like cell content`)
        }
        await Deno.writeTextFile(`${htmlDirectory}/${fileName}.html`, renderedHtml)
      }
    }
    console.log(JSON.stringify({
      fileName,
      strategy: prepared.conversion.strategy,
      pages: prepared.pageCount,
      sheets: prepared.conversion.sheets,
      warnings: prepared.conversion.warnings,
      distinctiveCells: prepared.distinctiveSourceText.length,
    }))
  }
} finally {
  globalThis.fetch = previousFetch
  Deno.env.delete("CARBONE_URL")
  Deno.env.delete("CARBONE_API_TOKEN")
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
