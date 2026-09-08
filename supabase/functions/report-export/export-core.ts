type Row = Record<string, string | number | null>
type Field = { id: string; label: string; type: string }
type Result = { rows: Row[]; columns: Field[]; start: string; end: string; description: string; recordCount: number; value?: number; comparison?: { value: number; start: string; end: string; change: number; percent: number | null } }
type Query = { mode: string; measure: string; currency: string; chart: string }
type Section = { kind: string; title: string; text?: string; query?: Query; result?: Result }
export type ExportRun = { id: string; name: string; report_version: number; created_at: string; definition: { kind: string; query?: Query }; snapshot: { kind: string; query?: Result; blocks?: Section[] } }
export const xml = (value: unknown) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;")
export function sections(run: ExportRun): Section[] {
  return run.snapshot.kind === "document" ? run.snapshot.blocks || [] : [{ kind: run.snapshot.kind, title: run.name, query: run.definition.query, result: run.snapshot.query }]
}
const display = (value: unknown) => typeof value === "number" ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value) : String(value ?? "")
export function csvCell(value: unknown) {
  let text = String(value ?? "")
  // Spreadsheet formula injection includes leading whitespace and control chars.
  if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function csv(run: ExportRun) {
  if (run.snapshot.kind === "document") throw new Error("Choose Excel or PDF for a document with multiple sections.")
  const result = run.snapshot.query!
  return "\uFEFF" + [result.columns.map(f => csvCell(f.label)).join(","), ...result.rows.map(row => result.columns.map(f => csvCell(row[f.id])).join(","))].join("\r\n")
}
const column = (n: number): string => n >= 26 ? column(Math.floor(n / 26) - 1) + String.fromCharCode(65 + n % 26) : String.fromCharCode(65 + n)
export function workbookEntries(run: ExportRun): Record<string, string> {
  const data = sections(run)
  const sheets: { name: string; rows: unknown[][] }[] = [{ name: "Report information", rows: [[run.name], ["Snapshot", run.id], ["Generated", run.created_at], ["Report version", run.report_version], ["Source", "Multideck"], ["Currency", "Original currency. No exchange-rate conversion."]] },
    ...data.map((section, i) => ({ name: `${i + 1} ${section.title}`.replace(/[\\/*?:\[\]]/g, " ").slice(0, 31), rows: section.result ? [
      [section.title], ["Period", section.result.start, section.result.end], ["Definition", section.result.description], ["Records", section.result.recordCount], ["Currency", section.query?.measure === "count" ? "" : section.query?.currency || ""],
      ...(section.result.value !== undefined ? [["Result", section.result.value]] : []),
      ...(section.result.comparison ? [["Comparison period", section.result.comparison.start, section.result.comparison.end], ["Previous value", section.result.comparison.value], ["Change", section.result.comparison.change], ["Change (%)", section.result.comparison.percent ?? "Previous value is zero"]] : []),
      section.result.columns.map(f => f.label), ...section.result.rows.map(row => section.result!.columns.map(f => row[f.id])),
    ] : [[section.title], [section.text || ""]] }))]
  const entries: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
  }
  sheets.forEach((s, i) => {
    entries[`xl/worksheets/sheet${i + 1}.xml`] = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${s.rows.map((row, index) => `<row r="${index + 1}">${row.map((value, c) => typeof value === "number" && Number.isFinite(value) ? `<c r="${column(c)}${index + 1}" t="n"><v>${value}</v></c>` : `<c r="${column(c)}${index + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`
  })
  return entries
}

export function chartSvg(result: Result, query: Query) {
  if (query.chart === "pie" && result.rows.every(r => Number(r.value || 0) >= 0)) {
    const positive = result.rows.filter(r => Number(r.value || 0) > 0)
    const slices = positive.length > 12 ? [...positive.slice(0, 11), { label: "Other groups", value: positive.slice(11).reduce((total, r) => total + Number(r.value), 0) }] : positive
    const total = slices.reduce((sum, r) => sum + Number(r.value), 0)
    const colours = ["#167568", "#4E66A6", "#A06825", "#845D9B", "#418799", "#A44F64", "#5C8135", "#695EAD", "#A34C27", "#386486", "#857629", "#657572"]
    let angle = -Math.PI / 2
    const arcs = slices.map((r, i) => {
      const fraction = Number(r.value) / total
      const end = angle + fraction * Math.PI * 2
      const path = fraction >= .999999 ? `<circle cx="170" cy="147" r="94" fill="${colours[i]}"/>` : `<path d="M170 147 L${170 + Math.cos(angle) * 94} ${147 + Math.sin(angle) * 94} A94 94 0 ${fraction > .5 ? 1 : 0} 1 ${170 + Math.cos(end) * 94} ${147 + Math.sin(end) * 94} Z" fill="${colours[i]}"/>`
      angle = end
      return path + `<rect x="315" y="${24 + i * 21}" width="10" height="10" fill="${colours[i]}"/><text x="333" y="${33 + i * 21}">${xml(String(r.label).slice(0, 36))}: ${xml(display(Number(r.value)))} (${(fraction * 100).toFixed(1)}%)</text>`
    }).join("")
    return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="310" viewBox="0 0 760 310"><rect width="760" height="310" fill="white"/><g font-family="Arial,sans-serif" font-size="11" fill="#344844">${arcs}<circle cx="170" cy="147" r="59" fill="white"/><text x="170" y="147" text-anchor="middle" font-size="20">${xml(display(total))}</text><text x="170" y="169" text-anchor="middle">${xml(query.measure === "count" ? "Records" : query.currency || "Value")}</text><text x="40" y="298">${positive.length > 12 ? "Remaining groups combined as Other groups. Complete data follows." : "Complete data follows."}</text></g></svg>`
  }
  const rows = result.rows.slice(0, 40)
  const values = rows.map(r => Number(r.value || 0))
  const min = Math.min(0, ...values), max = Math.max(0, ...values), range = max - min || 1
  const y = (v: number) => 230 - (v - min) / range * 180
  const width = 600 / Math.max(1, rows.length)
  const x = (i: number) => 70 + width * (i + .5)
  const points = rows.map((r, i) => `${x(i)},${y(Number(r.value || 0))}`).join(" ")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="310" viewBox="0 0 760 310"><rect width="760" height="310" fill="white"/><g font-family="Arial,sans-serif" font-size="11" fill="#344844"><path d="M60 ${y(0)}H690" stroke="#c5d2ce"/>${[min, (min + max) / 2, max].map(v => `<text x="54" y="${y(v) + 4}" text-anchor="end">${xml(display(v))}</text>`).join("")}${query.chart === "line" ? `<polyline points="${points}" fill="none" stroke="#167568" stroke-width="3"/>` : rows.map((r, i) => `<rect x="${x(i) - width * .32}" y="${Math.min(y(0), y(Number(r.value || 0)))}" width="${width * .64}" height="${Math.max(1, Math.abs(y(Number(r.value || 0)) - y(0)))}" fill="#167568"/>`).join("")}${rows.filter((_, i) => i % Math.ceil(rows.length / 10) === 0).map(r => { const i = rows.indexOf(r); return `<text x="${x(i)}" y="265" text-anchor="middle">${xml(String(r.label).slice(0, 16))}</text>` }).join("")}<text x="70" y="298">${xml(query.measure === "count" ? "Records" : query.currency || "Value")}${query.chart === "pie" ? " · Negative values shown as bars" : ""}${result.rows.length > 40 ? " · Chart shows first 40 groups; complete data follows" : ""}</text></g></svg>`
}

export function docxEntries(run: ExportRun, templateData?: Record<string, string>): Record<string, string> {
  const entries: Record<string, string> = {}
  const relationships: string[] = []
  let imageIndex = 0
  let textIndex = 0
  // When sending to Carbone, business text is data, never executable template syntax.
  const literal = (text: unknown) => {
    if (!templateData) return xml(text)
    const key = `text${++textIndex}`
    templateData[key] = String(text ?? "")
    return `{d.${key}}`
  }
  const p = (text: unknown, size = 20, bold = false) => `<w:p><w:pPr><w:spacing w:after="140"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="${size}"/>${bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${literal(text)}</w:t></w:r></w:p>`
  const parts = [p("Multideck", 22, true), p(run.name, 38, true), p(`Generated ${new Date(run.created_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC · Version ${run.report_version}`, 18)]
  for (const section of sections(run)) {
    if (run.snapshot.kind === "document") parts.push(p(section.title, 28, true))
    if (!section.result) { for (const line of (section.text || "").split("\n")) parts.push(p(line)); continue }
    const result = section.result
    parts.push(p(`${result.start} to ${result.end} · ${result.recordCount} records${section.query?.currency ? ` · ${section.query.currency}` : ""}`, 18), p(result.description, 17))
    if (result.value !== undefined) parts.push(p(`Result: ${display(result.value)}${section.query?.measure !== "count" && section.query?.currency ? ` ${section.query.currency}` : ""}`, 26, true))
    if (result.comparison) parts.push(p(`Change: ${display(result.comparison.change)} (${result.comparison.percent === null ? "previous value is zero" : `${display(result.comparison.percent)}%`}) compared with ${result.comparison.start} to ${result.comparison.end}`, 18))
    if (section.kind === "chart" && section.query && result.rows.length) {
      imageIndex++
      entries[`word/media/chart${imageIndex}.svg`] = chartSvg(result, section.query)
      relationships.push(`<Relationship Id="chart${imageIndex}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/chart${imageIndex}.svg"/>`)
      parts.push(`<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5943600" cy="2425200"/><wp:docPr id="${imageIndex}" name="Chart ${imageIndex}" descr="Chart; accessible data table follows"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${imageIndex}" name="Chart"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="chart${imageIndex}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5943600" cy="2425200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`)
    }
    const headers = result.columns.map(f => f.label)
    const rows = result.rows.map(row => result.columns.map(f => display(row[f.id])))
    // Wide reports wrap into column bands, repeating their first identifier.
    for (let start = 1; start < Math.max(headers.length, 2); start += 6) {
      const indexes = [0, ...headers.map((_, i) => i).slice(start, start + 6)]
      const row = (values: string[], header: boolean) => `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${indexes.map(i => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9360 / indexes.length)}" w:type="dxa"/>${header ? '<w:shd w:fill="EAF3F0"/>' : ""}</w:tcPr>${p(values[i], 16, header)}</w:tc>`).join("")}</w:tr>`
      parts.push(`<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="D9E3DF"/><w:insideH w:val="single" w:sz="4" w:color="D9E3DF"/></w:tblBorders></w:tblPr><w:tblGrid>${indexes.map(() => `<w:gridCol w:w="${Math.floor(9360 / indexes.length)}"/>`).join("")}</w:tblGrid>${row(headers, true)}${rows.map(values => row(values, false)).join("")}</w:tbl>${p("")}`)
    }
    if (!rows.length) parts.push(p("No matching records."))
  }
  entries["word/document.xml"] = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${parts.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1273" w:bottom="1080" w:left="1273"/></w:sectPr></w:body></w:document>`
  entries["word/_rels/document.xml.rels"] = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`
  entries["[Content_Types].xml"] = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  entries["_rels/.rels"] = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  return entries
}
