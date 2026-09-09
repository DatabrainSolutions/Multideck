import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync, strToU8, unzipSync } from "fflate"

const RELEASE = "2025-1"
const SOURCE_URL = `https://opensource.unicc.org/un/unece/uncefact/vocab-locode/-/jobs/artifacts/${RELEASE}/download?job=package-release`
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const outputDirectory = resolve(scriptDirectory, "../public/reference")
const dataPath = resolve(outputDirectory, `unlocode-${RELEASE}.json.gz`)
const metadataPath = resolve(outputDirectory, "unlocode-directory.meta.json")

function parseCsv(input) {
  const rows = []
  let row = []
  let field = ""
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }
    if (character === '"') quoted = true
    else if (character === ",") {
      row.push(field)
      field = ""
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""))
      rows.push(row)
      row = []
      field = ""
    } else field += character
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""))
    rows.push(row)
  }
  return rows
}

const response = await fetch(SOURCE_URL)
if (!response.ok) throw new Error(`UN/LOCODE download failed with ${response.status}`)

const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))
const csvNames = Object.keys(archive)
  .filter((name) => /release\/csv\/UNLOCODE CodeListPart\d+\.csv$/.test(name))
  .sort()

if (!csvNames.length) throw new Error("The official archive did not contain UN/LOCODE CSV files.")

const records = csvNames.flatMap((name) => parseCsv(new TextDecoder().decode(archive[name])))
  .flatMap((row) => {
    const countryCode = row[1]?.trim().toUpperCase() ?? ""
    const locationCode = row[2]?.trim().toUpperCase() ?? ""
    const name = row[3]?.trim() ?? ""
    if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z0-9]{3}$/.test(locationCode) || !name) return []
    const asciiName = row[4]?.trim() ?? ""
    const functions = row[6]?.trim() ?? ""
    return [[countryCode, locationCode, name, asciiName === name ? "" : asciiName, functions]]
  })

const json = JSON.stringify(records)
const compressed = gzipSync(strToU8(json), { level: 9 })
const checksum = createHash("sha256").update(compressed).digest("hex")

await mkdir(outputDirectory, { recursive: true })
await writeFile(dataPath, compressed)
await writeFile(metadataPath, `${JSON.stringify({
  release: RELEASE,
  recordCount: records.length,
  source: SOURCE_URL,
  sourceOrganisation: "United Nations Economic Commission for Europe",
  licence: "CC BY 4.0",
  sha256: checksum,
}, null, 2)}\n`)

console.log(`Generated ${records.length.toLocaleString("en-GB")} UN/LOCODE records (${compressed.byteLength.toLocaleString("en-GB")} bytes).`)
