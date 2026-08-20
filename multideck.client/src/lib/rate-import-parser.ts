import { unzipSync, strFromU8 } from "fflate"
import type { RateMode, RateRecordInput, RateRecordType } from "@/lib/rates-api"

export type RateImportPreview = {
  fileName: string
  format: string
  rows: string[][]
  rawText: string
  suggested: Partial<RateRecordInput>
  warnings: string[]
}

function splitDelimited(text: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"' && text[index + 1] === '"' && quoted) { value += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if (character === delimiter && !quoted) { row.push(value.trim()); value = "" }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      row.push(value.trim()); value = ""
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else value += character
  }
  row.push(value.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows.slice(0, 250)
}

function xmlText(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  return Array.from(doc.querySelectorAll("t")).map((node) => node.textContent ?? "").join(" ")
}

async function parseXlsx(file: File) {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const sharedXml = archive["xl/sharedStrings.xml"] ? strFromU8(archive["xl/sharedStrings.xml"]) : ""
  const sharedDoc = new DOMParser().parseFromString(sharedXml, "application/xml")
  const shared = Array.from(sharedDoc.querySelectorAll("si")).map((cell) => Array.from(cell.querySelectorAll("t")).map((node) => node.textContent ?? "").join(""))
  const sheetName = Object.keys(archive).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
  if (!sheetName) return []
  const sheetDoc = new DOMParser().parseFromString(strFromU8(archive[sheetName]), "application/xml")
  return Array.from(sheetDoc.querySelectorAll("row")).slice(0, 250).map((row) => Array.from(row.querySelectorAll("c")).map((cell) => {
    const value = cell.querySelector("v")?.textContent ?? ""
    return cell.getAttribute("t") === "s" ? shared[Number(value)] ?? "" : value
  }))
}

async function parsePdf(file: File) {
  const pdfjs = await import("pdfjs-dist")
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let pageNo = 1; pageNo <= Math.min(document.numPages, 50); pageNo += 1) {
    const content = await (await document.getPage(pageNo)).getTextContent()
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "))
  }
  return pages.join("\n")
}

function findValue(rows: string[][], names: string[]) {
  const header = rows[0]?.map((cell) => cell.toLowerCase()) ?? []
  const index = header.findIndex((cell) => names.some((name) => cell.includes(name)))
  return index < 0 ? "" : rows[1]?.[index] ?? ""
}

function suggest(rows: string[][], rawText: string): Partial<RateRecordInput> {
  const haystack = `${rows.flat().join(" ")} ${rawText}`.toLowerCase()
  const mode: RateMode = /\bair\b/.test(haystack) ? "air" : /\broad|truck|pallet\b/.test(haystack) ? "road" : /\bfcl|container|40hc|20gp\b/.test(haystack) ? "fcl" : "lcl"
  const type: RateRecordType = /sales tariff|customer tariff|sell rate/.test(haystack) ? "sales_tariff" : "cost_tariff"
  const buy = Number(findValue(rows, ["buy", "cost", "supplier rate"]).replace(/[^0-9.-]/g, "")) || 0
  const sell = Number(findValue(rows, ["sell", "sales", "customer rate"]).replace(/[^0-9.-]/g, "")) || 0
  return {
    name: fileSafeName(findValue(rows, ["name", "tariff", "contract"]) || "Imported rate"),
    type,
    mode,
    origin: findValue(rows, ["origin", "from", "pol"]),
    destination: findValue(rows, ["destination", "to", "pod"]),
    carrier: findValue(rows, ["carrier", "line"]),
    supplier: findValue(rows, ["supplier", "vendor"]),
    currency: (findValue(rows, ["currency", "curr"]) || "GBP").slice(0, 3).toUpperCase(),
    buyTotal: buy,
    sellTotal: sell,
  }
}

function fileSafeName(value: string) { return value.replace(/\s+/g, " ").trim().slice(0, 120) }

export async function parseRateImport(file: File): Promise<RateImportPreview> {
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose a rate file smaller than 15 MB.")
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? ""
  let rows: string[][] = []
  let rawText = ""
  if (extension === "xlsx") rows = await parseXlsx(file)
  else if (extension === "pdf") rawText = await parsePdf(file)
  else {
    rawText = await file.text()
    if (["csv", "tsv"].includes(extension)) rows = splitDelimited(rawText, extension === "tsv" ? "\t" : ",")
  }
  if (!rows.length && rawText) rows = rawText.split(/\r?\n/).filter(Boolean).slice(0, 250).map((line) => [line.trim()])
  if (!rows.length) throw new Error("No readable rate information was found in this file.")
  return {
    fileName: file.name,
    format: extension || file.type || "unknown",
    rows,
    rawText: rawText.slice(0, 20_000),
    suggested: suggest(rows, rawText),
    warnings: ["Check the route, validity, charge basis and totals before saving."],
  }
}
