import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = await readFile(new URL("../functions/event-location-search/core.ts", import.meta.url), "utf8")
const { locationQuery, locationSuggestions } = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`)
const feature = properties => ({ properties })

test("search keeps worldwide text and accepts a postcode without spaces", () => {
  assert.equal(locationQuery("  LS268FU  "), "LS268FU")
  assert.equal(locationQuery("東京  駅"), "東京 駅")
  for (const value of [null, {}, "ab", " ", "a".repeat(241)]) assert.throws(() => locationQuery(value))
})

test("suggestions preserve venue, address and country without duplicated parts", () => {
  assert.deepEqual(locationSuggestions({ features: [feature({ osm_type: "N", osm_id: 123, name: "Boom Battle Bar", street: "George Street", city: "Leeds", state: "England", postcode: "LS2 7JD", country: "United Kingdom" })] }), [{
    id: "N:123", label: "Boom Battle Bar", detail: "George Street, Leeds, England, LS2 7JD, United Kingdom", value: "Boom Battle Bar, George Street, Leeds, England, LS2 7JD, United Kingdom",
  }])
  const postcode = locationSuggestions({ features: [feature({ name: "LS26 8FU", postcode: "LS26 8FU", city: "Leeds", country: "United Kingdom" })] })[0]
  assert.equal(postcode.value, "LS26 8FU, Leeds, United Kingdom")
  const address = locationSuggestions({ features: [feature({ housenumber: "10", street: "Rue de la Paix", city: "Paris", postcode: "75002", country: "France" })] })[0]
  assert.equal(address.value, "10 Rue de la Paix, Paris, 75002, France")
})

test("missing, duplicated and oversized provider records do not become choices", () => {
  const place = feature({ name: "Sydney Opera House", city: "Sydney", country: "Australia" })
  assert.equal(locationSuggestions({ features: [null, feature({}), place, place, feature({ name: "a".repeat(241) })] }).length, 1)
  assert.equal(locationSuggestions({ features: Array.from({ length: 10 }, (_, i) => feature({ name: `Venue ${i}` })) }).length, 5)
  assert.throws(() => locationSuggestions({ error: "unavailable" }))
})
