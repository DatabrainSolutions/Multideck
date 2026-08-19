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

export function createCsvParser(onRow: (row: string[]) => void) {
  let row: string[] = []
  let field = ""
  let quoted = false
  let quotePending = false

  const commitRow = () => {
    row.push(field)
    if (row.some((value) => value.trim())) onRow(row)
    row = []
    field = ""
  }

  const handleUnquoted = (char: string, next: string | undefined) => {
    if (char === '"') {
      quoted = true
      return 0
    }
    if (char === ",") {
      row.push(field)
      field = ""
      return 0
    }
    if (char === "\n") {
      commitRow()
      return 0
    }
    if (char === "\r") {
      commitRow()
      return next === "\n" ? 1 : 0
    }
    field += char
    return 0
  }

  return {
    push(text: string) {
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        const next = text[index + 1]
        if (quotePending) {
          quotePending = false
          if (char === '"') {
            field += '"'
            continue
          }
          quoted = false
          index += handleUnquoted(char, next)
          continue
        }
        if (quoted) {
          if (char === '"') {
            if (next === '"') {
              field += '"'
              index += 1
            } else if (next === undefined) {
              quotePending = true
            } else {
              quoted = false
            }
            continue
          }
          field += char
          continue
        }
        index += handleUnquoted(char, next)
      }
    },
    end() {
      if (quotePending) quoted = false
      if (quoted || field || row.length) commitRow()
    },
  }
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  const parser = createCsvParser((row) => rows.push(row))
  parser.push(text)
  parser.end()
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

function isHeaderRow(values: string[]) {
  const keys = values.map(headerKey)
  return keys.includes("group id") && keys.includes("name 1")
}

function ofsiEntryFromValues(keys: string[], values: string[]): ParsedScreeningEntry | null {
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
  if (!groupId || !name || !normalizedName) return null
  return {
    groupId,
    uniqueId: cell(row, "unique id"),
    name: name.slice(0, 500),
    normalizedName: normalizedName.slice(0, 500),
    aliasType: cell(row, "alias type"),
    groupType: cell(row, "group type"),
    regime: cell(row, "regime name", "regime"),
    country: cell(row, "country"),
    listedOn: listedOn(cell(row, "listed on")),
    ukRef: ukRefFrom(row),
    otherInformation: extractOfsiListingNotes(cell(row, "other information")),
  }
}

export function extractOfsiListingNotes(other: string | null) {
  if (!other?.trim()) return null
  const fields = parseOfsiTaggedFields(other)
  const statement = firstTaggedValue(fields, "UK Statement of Reasons", "Statement of Reasons")
  if (statement) return clipListingNotes(statement)

  const narrative: string[] = []
  for (const [label, value] of fields) {
    const rest = adminTagRemainder(label, value)
    if (rest) narrative.push(rest)
  }
  if (narrative.length) return clipListingNotes(narrative.join(" "))

  const stripped = other
    .replace(/\(UK Sanctions List Ref\):\s*[A-Z0-9/-]+\.?\s*/gi, "")
    .replace(/\(UN Ref\):\s*[A-Za-z0-9.]+\.?\s*/g, "")
    .replace(/\(Gender\):\s*[A-Za-z]+\.?\s*/gi, "")
    .trim()
  return stripped ? clipListingNotes(stripped) : null
}

function parseOfsiTaggedFields(other: string) {
  const tag = /\(([^)]+)\):\s*/g
  const tags: { label: string; start: number; end: number }[] = []
  let matched: RegExpExecArray | null
  while ((matched = tag.exec(other))) {
    tags.push({
      label: matched[1].trim(),
      start: matched.index,
      end: matched.index + matched[0].length,
    })
  }
  const fields = new Map<string, string>()
  for (let index = 0; index < tags.length; index += 1) {
    const from = tags[index].end
    const to = index + 1 < tags.length ? tags[index + 1].start : other.length
    fields.set(tags[index].label, other.slice(from, to).replace(/[.\s]+$/u, "").trim())
  }
  return fields
}

function firstTaggedValue(fields: Map<string, string>, ...names: string[]) {
  for (const name of names) {
    const value = fields.get(name)?.trim()
    if (value) return value
  }
  return null
}

function adminTagRemainder(label: string, value: string) {
  if (/sanctions list ref/i.test(label)) {
    return value.replace(/^[A-Z0-9][A-Z0-9/-]*\.?\s*/u, "").trim()
  }
  if (/^un ref$/i.test(label)) {
    return value.replace(/^[A-Za-z0-9.]+\.?\s*/u, "").trim()
  }
  if (/^gender$/i.test(label)) {
    return value.replace(/^(male|female)\.?\s*/iu, "").trim()
  }
  return ""
}

function clipListingNotes(value: string) {
  const clipped = value.replace(/\s+/g, " ").trim()
  return clipped ? clipped.slice(0, 4000) : null
}

export function createOfsiEntryParser(onEntry: (entry: ParsedScreeningEntry) => void) {
  let keys: string[] | null = null
  let entryCount = 0
  const csv = createCsvParser((values) => {
    if (!keys) {
      if (isHeaderRow(values)) keys = values.map(headerKey)
      return
    }
    const entry = ofsiEntryFromValues(keys, values)
    if (!entry) return
    entryCount += 1
    onEntry(entry)
  })

  return {
    push(text: string) {
      csv.push(text)
    },
    end() {
      csv.end()
      if (!keys) throw new Error("The OFSI list did not include a header row.")
      if (!entryCount) throw new Error("The OFSI list did not contain any usable names.")
    },
  }
}

export function parseOfsiEntries(csvText: string) {
  const entries: ParsedScreeningEntry[] = []
  const parser = createOfsiEntryParser((entry) => entries.push(entry))
  parser.push(csvText.replace(/^\uFEFF/, ""))
  parser.end()
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
