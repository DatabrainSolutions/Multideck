import { airfreightAttachment, airportFromPublication, fetchAirfreightPublication, parseAirfreightAirportRows, type AirfreightPublication } from "./customs-airfreight-reference.ts"
import * as XLSX from "npm:xlsx@0.18.5/xlsx.mjs"

function equal(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`) }
function rejects(fn: () => unknown) { let rejected = false; try { fn() } catch { rejected = true } if (!rejected) throw new Error("Expected reference rejection") }
const header = ["Country", "Location of Airport", "Name of Airport (where Listed)", "Airport IATA Code", "Zone", "Percentage of Freight Liable to Import Duty"]
const jfk = ["United States of America, The", "New York", "John F Kennedy Intl", "JFK", "A", "70%"]
const attachment = "https://assets.publishing.service.gov.uk/media/fixture/20260724_CDS_DE_5-21_Appendix15B_AirportLoadingCodes.ods"

Deno.test("airport percentages remain exact and malformed official identifiers are not corrected", () => {
  const result = parseAirfreightAirportRows([header, jfk, ["US", "Kansas City", "Kansas City Intl", "MCl", "A", "70%"]])
  equal(result.airports.map(row => [row.code, row.customsPercentage]), [["JFK", "70"]])
  equal(result.rejectedRows[0].row, 3)
  equal(result.rejectedRows[0].values[3], "MCl")
  const publication = { ...result } as AirfreightPublication
  equal(airportFromPublication(publication, "JFK").zone, "A")
  rejects(() => airportFromPublication(publication, "MCI"))
  rejects(() => airportFromPublication(publication, "MCL"))
  rejects(() => airportFromPublication(publication, "jfk"))
  rejects(() => parseAirfreightAirportRows([[...header].reverse(), jfk]))
})
Deno.test("duplicate airports are all quarantined and missing rates never become zero", () => {
  const valid = ["China", "Shanghai", "Pudong", "PVG", "H", "70%"]
  const result = parseAirfreightAirportRows([header, jfk, [...jfk.slice(0, 5), "78%"], valid, ["US", "Other", "Other", "XXX", "A", ""], ["US", "Other", "Other", "YYY", "A", "101%"]])
  equal(result.airports.map(row => row.code), ["PVG"])
  equal(result.rejectedRows.length, 4)
  rejects(() => parseAirfreightAirportRows([header, [...jfk.slice(0, 5), "0.70"]]))
})
Deno.test("publication discovery cannot select arbitrary hosts or ambiguous attachments", () => {
  equal(airfreightAttachment(`<a href="${attachment}">Airports</a>`), attachment)
  rejects(() => airfreightAttachment(`<a href="${attachment.replace("assets.publishing.service.gov.uk", "evil.example")}">Airports</a>`))
  rejects(() => airfreightAttachment(`<a href="${attachment}">A</a><a href="${attachment.replace("/fixture/", "/other/")}">B</a>`))
  rejects(() => airfreightAttachment("No supported attachment"))
})
Deno.test("server reader preserves original publication bytes and refuses oversized responses", async () => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, jfk]), "Loading_codes")
  const bytes = XLSX.write(book, { type: "array", bookType: "ods" }) as ArrayBuffer
  const html = `<a href="${attachment}">Airport loading codes</a>`
  const requests: string[] = []
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    requests.push(String(url)); equal(options?.redirect, "error")
    return requests.length === 1 ? new Response(html) : new Response(bytes)
  }) as typeof fetch
  const publication = await fetchAirfreightPublication(fetcher)
  equal(publication.airports[0].customsPercentage, "70")
  equal(publication.publicationHtml, html)
  equal(publication.contentSha256.length, 64)
  equal(atob(publication.contentBase64).length, bytes.byteLength)
  equal(requests.length, 2)
  let rejected = false
  try { await fetchAirfreightPublication((async () => new Response("x".repeat(1_000_001))) as typeof fetch) } catch { rejected = true }
  equal(rejected, true)
})
