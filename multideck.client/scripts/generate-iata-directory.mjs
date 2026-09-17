import { writeFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import { createHash } from "node:crypto"

const source = "https://davidmegginson.github.io/ourairports-data/airports.csv"
const response = await fetch(source)
if (!response.ok) throw new Error(`Airport download failed: ${response.status}`)
const csv = await response.text()
// RFC 4180 fields, including quoted commas and escaped quotes.
const rows = []; let row = []; let field = ""; let quoted = false
for (let i = 0; i < csv.length; i++) {
  const c = csv[i]
  if (c === '"') {
    if (quoted && csv[i + 1] === '"') { field += '"'; i++ }
    else quoted = !quoted
  } else if (c === ',' && !quoted) { row.push(field); field = "" }
  else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = "" }
  else field += c
}
if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row) }
const headers = rows.shift()
const at = (row, key) => row[headers.indexOf(key)] || ""
const records = rows.filter(row => /^[A-Z]{3}$/.test(at(row, "iata_code")) && at(row, "type") !== "closed")
  .map(row => [at(row, "iata_code"), at(row, "name"), at(row, "municipality"), at(row, "iso_country")])
  .sort((a, b) => a[0].localeCompare(b[0]))
if (records.length < 5000) throw new Error("Airport directory unexpectedly incomplete")
const bytes = gzipSync(JSON.stringify(records))
await writeFile(new URL("../public/reference/iata-airports.json.gz", import.meta.url), bytes)
await writeFile(new URL("../public/reference/iata-airports.meta.json", import.meta.url), JSON.stringify({ source, sourceOrganisation: "OurAirports", licence: "Public domain", generatedAt: new Date().toISOString(), recordCount: records.length, sha256: createHash("sha256").update(bytes).digest("hex") }, null, 2) + "\n")
console.log(`Generated ${records.length} IATA airport entries (${bytes.length} compressed bytes)`)
