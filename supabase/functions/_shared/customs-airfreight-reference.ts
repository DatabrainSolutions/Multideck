// Reuse the spreadsheet reader already used by invoice-document-normalizer.
// @deno-types="npm:xlsx@0.18.5/types/index.d.ts"
import * as XLSX from "npm:xlsx@0.18.5/xlsx.mjs"

export const AIRFREIGHT_PUBLICATION = "https://www.gov.uk/government/publications/place-of-loading-codes-for-data-element-521-of-the-customs-declaration-service"
export type AirfreightAirport = { code: string; country: string; location: string; name: string; zone: string; customsPercentage: string }
type RejectedAirportRow = { row: number; values: string[]; reason: string }
export type AirfreightPublication = {
  source: string; attachment: string; retrievedAt: string
  publicationHtml: string; contentSha256: string; contentBase64: string
  airports: AirfreightAirport[]
  rejectedRows: RejectedAirportRow[]
}
const clean = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""

/** Read formatted percentage cells, not binary floating-point fractions. A
 * changed spreadsheet schema is a reference failure, never an inferred mapping. */
export function parseAirfreightAirportRows(rows: unknown[][]): { airports: AirfreightAirport[]; rejectedRows: RejectedAirportRow[] } {
  if (!rows.length || rows.length > 20_000) throw new Error("The airfreight airport table is empty or too large.")
  const header = rows[0].map(clean)
  const expected = ["Country", "Location of Airport", "Name of Airport (where Listed)", "Airport IATA Code", "Zone", "Percentage of Freight Liable to Import Duty"]
  if (expected.some((name, index) => header[index] !== name)) throw new Error("HMRC's airport table format has changed; review its columns before use.")
  const airports: AirfreightAirport[] = [], rejectedRows: RejectedAirportRow[] = []
  const counts = new Map<string, number>()
  for (const row of rows.slice(1)) { const code = clean(row[3]); counts.set(code, (counts.get(code) ?? 0) + 1) }
  for (const [index, values] of rows.slice(1).entries()) {
    const row = values.slice(0, 6).map(clean)
    if (row.every(value => !value)) continue
    const [country, location, name, code, zone, rawPercentage] = row
    const percentage = /^(\d{1,3}(?:\.\d{1,6})?)\s*%$/.exec(rawPercentage)?.[1]
    if (!country || !location || !/^[A-Z]{3}$/.test(code) || !/^[A-Z]$/.test(zone) || percentage === undefined || Number(percentage) > 100 || counts.get(code) !== 1) {
      rejectedRows.push({ row: index + 2, values: row, reason: "Missing, duplicate or invalid airport evidence; this entry cannot supply a rate." })
      continue
    }
    airports.push({ country, location, name, code, zone, customsPercentage: percentage })
  }
  if (!airports.length) throw new Error("HMRC's airport table contains no airport entries.")
  return { airports, rejectedRows }
}

export function airfreightAttachment(html: string): string {
  const matches = [...html.matchAll(/href=["'](https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"'<>]+\.ods)["']/g)]
    .map(match => match[1]).filter(url => /Appendix15B_AirportLoadingCodes\.ods$/i.test(url))
  const unique = [...new Set(matches)]
  if (unique.length !== 1) throw new Error("HMRC's current airport publication could not be identified unambiguously.")
  const url = new URL(unique[0])
  if (url.origin !== "https://assets.publishing.service.gov.uk" || url.search || url.hash || url.username || url.password) throw new Error("Invalid HMRC airport attachment location.")
  return url.href
}

async function boundedResponse(response: Response, maximum: number): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new Error(`HMRC airfreight reference unavailable (${response.status}).`)
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) throw new Error("HMRC airfreight reference exceeds the supported size.")
      chunks.push(value)
    }
  } catch (error) { await reader.cancel(); throw error }
  finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export async function fetchAirfreightPublication(fetcher: typeof fetch = fetch): Promise<AirfreightPublication> {
  const options = { redirect: "error" as const, signal: AbortSignal.timeout(15_000) }
  const html = new TextDecoder().decode(await boundedResponse(await fetcher(AIRFREIGHT_PUBLICATION, options), 1_000_000))
  const attachment = airfreightAttachment(html)
  const bytes = await boundedResponse(await fetcher(attachment, { redirect: "error", signal: AbortSignal.timeout(15_000) }), 2_000_000)
  const workbook = XLSX.read(bytes, { type: "array", cellText: true, sheetRows: 20_001 })
  if (workbook.SheetNames.length !== 1) throw new Error("HMRC's airport workbook must contain one unambiguous table.")
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][]
  const { airports, rejectedRows } = parseAirfreightAirportRows(rows)
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return { source: AIRFREIGHT_PUBLICATION, attachment, retrievedAt: new Date().toISOString(), publicationHtml: html, contentSha256: [...hash].map(value => value.toString(16).padStart(2, "0")).join(""), contentBase64: btoa(binary), airports, rejectedRows }
}

/** This lookup identifies a published entry only. Applicability to the movement,
 * historical date and nearest-airport substitutions needs separate evidence. */
export function airportFromPublication(publication: AirfreightPublication, code: string): AirfreightAirport {
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Enter the three-letter airport of loading from the air waybill.")
  const matches = publication.airports.filter(airport => airport.code === code)
  if (matches.length !== 1) throw new Error("The airport has no unique published entry. Establish the appropriate listed airport with supporting evidence; do not guess a percentage.")
  return { ...matches[0] }
}
