import assert from "node:assert/strict"
import { createRequire, stripTypeScriptTypes } from "node:module"
import { readFileSync } from "node:fs"
import test from "node:test"
const source = readFileSync(new URL("../functions/report-export/export-core.ts", import.meta.url), "utf8")
const { csv, csvCell, docxEntries, workbookEntries, chartSvg } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`)
const require = createRequire(new URL("../../multideck.client/package.json", import.meta.url))
const { zipSync, unzipSync, strToU8, strFromU8 } = require("fflate")
const result = { rows: [{ reference: '=HYPERLINK("https://example.invalid")', amount: -23.25 }, { reference: "Harbour & Sons <London>", amount: 125.75 }], columns: [{ id: "reference", label: "Reference", type: "text" }, { id: "amount", label: "Amount", type: "money" }], start: "2026-07-01", end: "2026-08-31", description: "Net of VAT & credit notes", recordCount: 2 }
const run = { id: "snapshot-id", name: "Sales & jobs", report_version: 3, created_at: "2026-09-07T10:00:00Z", definition: { kind: "table", query: { mode: "rows", currency: "GBP", measure: "count", chart: "bar" } }, snapshot: { kind: "table", query: result } }
test("CSV protects formula-like cells while preserving negative numeric values", () => {
  assert.equal(csvCell("\t=1+1"), '"\'\t=1+1"')
  assert.equal(csvCell(-23.25), '"-23.25"')
  assert.match(csv(run), /'\=HYPERLINK/)
  assert.match(csv(run), /Harbour & Sons <London>/)
})
test("Excel uses typed numbers and literal text, with snapshot evidence", () => {
  const entries = workbookEntries(run)
  const archive = zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, strToU8(value)])))
  const reopened = unzipSync(archive)
  const worksheet = strFromU8(reopened["xl/worksheets/sheet2.xml"])
  assert.match(worksheet, /t="n"><v>-23\.25<\/v>/)
  assert.match(worksheet, /HYPERLINK\(&quot;/)
  assert.doesNotMatch(worksheet, /<f>/)
  assert.match(worksheet, /Harbour &amp; Sons &lt;London&gt;/)
  assert.match(strFromU8(reopened["xl/worksheets/sheet1.xml"]), /snapshot-id/)
})
test("Document exports include every section, ordered commentary, charts and full data", () => {
  const document = { ...run, definition: { kind: "document" }, snapshot: { kind: "document", blocks: [
    { id: "a", kind: "text", title: "Review", text: "First line\nSecond <line>" },
    { id: "b", kind: "chart", title: "Sales growth", query: { mode: "summary", measure: "net", currency: "GBP", chart: "line" }, result: { ...result, rows: [{ label: "July", value: 100 }, { label: "August", value: -20 }], columns: [{ id: "label", label: "Month", type: "text" }, { id: "value", label: "Value", type: "number" }] } },
    { id: "c", kind: "table", title: "Jobs", result },
  ] } }
  const entries = docxEntries(document)
  assert.match(entries["word/document.xml"], /Second &lt;line&gt;/)
  assert.ok(entries["word/document.xml"].indexOf("Review") < entries["word/document.xml"].indexOf("Sales growth"))
  assert.match(entries["word/document.xml"], /accessible data table follows/)
  assert.match(entries["word/media/chart1.svg"], /polyline/)
  assert.doesNotMatch(entries["word/media/chart1.svg"], /NaN|Infinity/)
  assert.equal(Object.keys(workbookEntries(document)).filter(key => key.startsWith("xl/worksheets/")).length, 4)
  assert.throws(() => csv(document), /multiple sections/)
})

test("Donut exports include all groups, safe zero totals and signed-value fallback", () => {
  const query = { chart: "pie", measure: "net", currency: "GBP" }
  const chart = chartSvg({ ...result, rows: Array.from({ length: 15 }, (_, i) => ({ label: `Group ${i}`, value: 10 })) }, query)
  assert.match(chart, /Other groups: 40 \(26\.7%\)/)
  assert.match(chart, />150<\/text>/)
  assert.match(chartSvg({ ...result, rows: [{ label: "Credit", value: -10 }] }, query), /Negative values shown as bars/)
  assert.doesNotMatch(chartSvg({ ...result, rows: [{ label: "Zero", value: 0 }] }, query), /NaN|Infinity/)
})

test("Carbone receives user commentary as data rather than template syntax", () => {
  const literal = "Customer wrote {d.name:drop(p)} & <example>"
  const data = {}
  const entries = docxEntries({ ...run, name: literal }, data)
  assert.doesNotMatch(entries["word/document.xml"], /drop\(p\)/)
  assert.ok(Object.values(data).includes(literal))
  assert.match(entries["word/document.xml"], /\{d\.text[0-9]+\}/)
})
