export const UK_OFSI_SOURCE_CODE = "uk_ofsi_consolidated"
export const UK_OFSI_CSV_URL = "https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv"
export const SCREENING_STALE_AFTER_HOURS = 36
export const SCREENING_SIMILAR_THRESHOLD = 0.82

const COMPANY_SUFFIXES = new Set([
  "ag", "bv", "co", "company", "corp", "gmbh", "inc", "incorporated", "limited",
  "llc", "llp", "ltd", "plc", "pty", "sa", "sarl",
])

export type ScreeningOutcome = "clear" | "possible_match" | "match" | "unavailable"
export type ScreeningMatchKind = "exact" | "similar"

export type ParsedScreeningEntry = {
  groupId: string
  uniqueId: string | null
  name: string
  normalizedName: string
  aliasType: string | null
  groupType: string | null
  regime: string | null
  country: string | null
  listedOn: string | null
  ukRef: string | null
  otherInformation: string | null
}

export function normalizeScreeningName(value: unknown) {
  const source = typeof value === "string" ? value : ""
  const folded = source
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
  const tokens = folded.split(/\s+/).filter((token) => token && !COMPANY_SUFFIXES.has(token))
  return tokens.join(" ") || null
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ",") {
      row.push(field)
      field = ""
      continue
    }
    if (char === "\n" || (char === "\r" && next === "\n")) {
      row.push(field)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ""
      if (char === "\r") index += 1
      continue
    }
    if (char !== "\r") field += char
  }

  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function headerKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ")
}

function cell(row: Map<string, string>, ...names: string[]) {
  for (const name of names) {
    const value = row.get(headerKey(name))?.trim()
    if (value) return value
  }
  return null
}

function listedOn(value: string | null) {
  if (!value) return null
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const uk = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!uk) return null
  return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`
}

function ukRefFrom(row: Map<string, string>) {
  const direct = cell(row, "uk sanctions list ref")
  if (direct) return direct
  const other = cell(row, "other information")
  const matched = other?.match(/UK Sanctions List Ref\)?:\s*([A-Z0-9/-]+)/i)
  return matched?.[1] ?? null
}

function headerRowIndex(rows: string[][]) {
  return rows.findIndex((row) => {
    const keys = row.map(headerKey)
    return keys.includes("group id") && keys.includes("name 1")
  })
}

export function parseOfsiEntries(csvText: string) {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ""))
  const headerIndex = headerRowIndex(rows)
  const header = headerIndex >= 0 ? rows[headerIndex] : null
  if (!header?.length) throw new Error("The OFSI list did not include a header row.")

  const keys = header.map(headerKey)
  const entries: ParsedScreeningEntry[] = []

  for (const values of rows.slice(headerIndex + 1)) {
    const row = new Map(keys.map((key, index) => [key, values[index] ?? ""]))
    const groupId = cell(row, "group id", "ofsi group id")
    const name = [
      cell(row, "name 1"),
      cell(row, "name 2"),
      cell(row, "name 3"),
      cell(row, "name 4"),
      cell(row, "name 5"),
      cell(row, "name 6"),
      cell(row, "title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
    const normalizedName = normalizeScreeningName(name)
    if (!groupId || !name || !normalizedName) continue

    entries.push({
      groupId,
      uniqueId: cell(row, "unique id"),
      name,
      normalizedName,
      aliasType: cell(row, "alias type"),
      groupType: cell(row, "group type"),
      regime: cell(row, "regime name", "regime"),
      country: cell(row, "country"),
      listedOn: listedOn(cell(row, "listed on")),
      ukRef: ukRefFrom(row),
      otherInformation: cell(row, "other information")?.slice(0, 500) ?? null,
    })
  }

  if (!entries.length) throw new Error("The OFSI list did not contain any usable names.")
  return entries
}

export async function sha256Hex(content: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function listIsStale(downloadedAt: string | null, now = Date.now()) {
  if (!downloadedAt) return true
  const ageMs = now - Date.parse(downloadedAt)
  return !Number.isFinite(ageMs) || ageMs > SCREENING_STALE_AFTER_HOURS * 60 * 60 * 1000
}
