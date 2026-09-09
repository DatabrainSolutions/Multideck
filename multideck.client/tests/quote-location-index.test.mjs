import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import {
  EMPTY_LOCATION,
  filterLocationsForMode,
  getLocationDirectoryIndex,
  resolveLinkedLocation,
} from "../src/components/multideck/quote-details/quote-detail-model.ts"

const port = { id: "port", countryCode: "GB", countryName: "United Kingdom", place: "London", unlocode: "GBLON", kind: "port", recommended: true }
const airport = { id: "airport", countryCode: "GB", countryName: "United Kingdom", place: "Heathrow", unlocode: "GBLHR", kind: "airport", aliases: ["London Heathrow"] }
const city = { id: "city", countryCode: "FR", countryName: "France", place: "Saint-Étienne", unlocode: "FRSNE", kind: "city", aliases: ["Saint Etienne"] }
const manual = { id: "address", countryCode: "GB", countryName: "United Kingdom", place: "Depot", unlocode: "" }
const options = [port, airport, city, manual]

test("mode indexes retain directory order, country lists and recommended entries", () => {
  for (const mode of [undefined, "Multimodal", "Air freight", "Sea freight", "Road", "Rail", "other"]) {
    const index = getLocationDirectoryIndex(options, mode)
    const expected = filterLocationsForMode(options, mode)
    assert.deepEqual(index.options, expected)
    assert.deepEqual(index.byCountryCode.get("gb") ?? [], expected.filter((option) => option.countryCode === "GB"))
    assert.deepEqual(index.recommended, expected.filter((option) => option.recommended))
    assert.equal(getLocationDirectoryIndex(options, mode), index)
  }
  assert.equal(getLocationDirectoryIndex(options, "AIR cargo"), getLocationDirectoryIndex(options, "air"))
  assert.notEqual(getLocationDirectoryIndex([...options]), getLocationDirectoryIndex(options))
})

test("linked selection preserves aliases, manual values and country changes", () => {
  assert.deepEqual(resolveLinkedLocation(options, EMPTY_LOCATION, "place", "London Heathrow"), airport)
  assert.deepEqual(resolveLinkedLocation(options, EMPTY_LOCATION, "place", "saint_etienne"), city)
  assert.deepEqual(resolveLinkedLocation(options, EMPTY_LOCATION, "unlocode", "gb lhr"), airport)
  assert.deepEqual(resolveLinkedLocation(options, port, "country", "France"), city)
  assert.deepEqual(resolveLinkedLocation(options, airport, "country", "GB"), airport)
  assert.deepEqual(resolveLinkedLocation(options, port, "place", "Unlisted depot"), { ...port, place: "Unlisted depot" })
  assert.deepEqual(resolveLinkedLocation(options, port, "country", "Unknown"), { ...port, countryCode: "", countryName: "Unknown", place: "", unlocode: "" })
  assert.deepEqual(resolveLinkedLocation(options, port, "place", ""), { ...port, place: "" })
})

test("ambiguous places stay manual and duplicate identifiers preserve prior selection rules", () => {
  const frenchLondon = { ...port, id: "other-country", countryCode: "FR", countryName: "France", unlocode: "FRLON" }
  const ambiguous = [port, frenchLondon]
  assert.deepEqual(resolveLinkedLocation(ambiguous, EMPTY_LOCATION, "place", "London"), { ...EMPTY_LOCATION, place: "London" })
  assert.deepEqual(resolveLinkedLocation(ambiguous, { ...EMPTY_LOCATION, countryCode: "GB" }, "place", "London"), port)
  const duplicate = { ...port, aliases: ["Londinium"] }
  const index = getLocationDirectoryIndex([port, duplicate])
  assert.equal(index.byId.get("port"), port)
  assert.deepEqual(resolveLinkedLocation(index.options, EMPTY_LOCATION, "place", "London"), duplicate)
})

test("the complete official directory is indexed without losing or reordering countries", () => {
  const rows = JSON.parse(gunzipSync(readFileSync(new URL("../public/reference/unlocode-2025-1.json.gz", import.meta.url))))
  const directory = rows.map(([countryCode, code, place, alias]) => ({
    id: `${countryCode}${code}`, countryCode, countryName: countryCode,
    place, unlocode: `${countryCode}${code}`, aliases: alias ? [alias] : [],
  }))
  assert.equal(directory.length, 116232)
  const index = getLocationDirectoryIndex(directory)
  assert.equal(index.options.length, directory.length)
  for (const country of ["GB", "FR", "NL", "DE", "US", "CN"]) {
    assert.deepEqual(index.byCountryCode.get(country.toLowerCase()), directory.filter((option) => option.countryCode === country))
  }
  for (const option of directory.filter((_, position) => position % 997 === 0)) {
    assert.equal(index.byId.get(option.id), option)
    assert.equal(resolveLinkedLocation(directory, EMPTY_LOCATION, "unlocode", option.unlocode).unlocode, option.unlocode)
  }
})
