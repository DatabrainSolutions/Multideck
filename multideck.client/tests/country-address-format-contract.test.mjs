import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/lib/country-address-format.ts", import.meta.url), "utf8")

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
