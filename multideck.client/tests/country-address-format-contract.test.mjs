import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { stripTypeScriptTypes } from "node:module"

const source = readFileSync(new URL("../src/lib/country-address-format.ts", import.meta.url), "utf8")
const { addressFieldsForCountry, addressFieldLabel } = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`)

test("country labels follow the address, including manually changed country codes", () => {
  for (const [country, postal, region] of [["GB", "Postcode", "County"], ["us", "ZIP code", "State"], [" CA ", "Postal code", "Province or territory"], ["AU", "Postcode", "State or territory"], ["IE", "Eircode", "County"], ["JP", "Postal code", "Prefecture"], ["DE", "Postal code", "Region, state or province"]]) {
    assert.equal(addressFieldLabel(country, "postZipCode"), postal)
    assert.equal(addressFieldLabel(country, "countyState"), region)
  }
  assert.equal(addressFieldsForCountry("JP")[0].key, "postZipCode")
  assert.equal(addressFieldLabel(undefined, "postZipCode"), "Postal code")
})

test("address country options cover the complete ISO alpha-2 list", () => {
  const codes = source.match(/const isoCountryCodes = `([^`]+)`/)?.[1].split(" ") ?? []
  assert.equal(codes.length, 249)
  assert.equal(new Set(codes).size, 249)
  for (const code of ["GB", "US", "CA", "AU", "IE", "JP", "ZA", "AE", "CN"]) assert.ok(codes.includes(code))
  assert.match(source, /new Intl\.DisplayNames/)
})

test("address labels and ordering respond to the selected country", () => {
  assert.match(source, /code === "US"[\s\S]*"State"[\s\S]*"ZIP code"/)
  assert.match(source, /code === "GB"[\s\S]*"County"[\s\S]*"Postcode"/)
  assert.match(source, /code === "JP"[\s\S]*"Postal code"[\s\S]*"Prefecture"[\s\S]*"City, ward or town"/)
})
