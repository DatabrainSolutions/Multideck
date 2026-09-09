import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { test } from "node:test"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..", "templates", "mng-air-waybill")
const builder = readFileSync(resolve(root, "build-docx.py"), "utf8")
const sample = JSON.parse(readFileSync(resolve(root, "mng-air-waybill.sample.json"), "utf8"))
const migrations = resolve(import.meta.dirname, "..", "migrations")
const registrationFile = readdirSync(migrations).find((file) => file.endsWith("_register_mng_air_waybill_template.sql"))
const registration = readFileSync(resolve(migrations, registrationFile), "utf8")

test("MNG Air Waybill uses only approved job snapshot paths", () => {
  const tags = [...builder.matchAll(/\{(d\.[^}]+)\}/g)].map((match) => match[1])
  const permitted = [
    /^d\.shipper(?:\.|$)/,
    /^d\.consignee(?:\.|$)/,
    /^d\.job(?:\.|$)/,
    /^d\.routing\[isMainCarriage=true\](?:\.|$)/,
    /^d\.cargo(?:\[|\.|$)/,
  ]

  assert.ok(tags.length > 0)
  for (const tag of tags) assert.ok(permitted.some((path) => path.test(tag)), `Unexpected MNG AWB data path: ${tag}`)
  assert.equal(builder.includes("{{"), false)
})

test("MNG Air Waybill keeps all variable fields bounded", () => {
  assert.match(builder, /Every variable is constrained/)
  assert.match(builder, /masterTransportReference:substr\(0,3\)/)
  assert.match(builder, /origin\.unlocode:substr\(2,5\)/)
  assert.match(builder, /masterTransportReference:ellipsis\(18\)/)
  assert.match(builder, /commodity:ellipsis\(30\)/)
  assert.match(builder, /description:aggStr\(' · '\):ellipsis\(76\)/)
  assert.match(builder, /city:ellipsis\(28\).*countyOrState:ellipsis\(20\)/)
  assert.doesNotMatch(builder, /city:ellipsis\(40\).*countyOrState:ellipsis\(38\)/s)
})

test("MNG Air Waybill contains one face and one complete conditions page", () => {
  assert.match(builder, /\[\[MNG_AWB_FACE\]\]/)
  assert.match(builder, /\[\[MNG_AWB_CONDITIONS\]\]/)
  assert.match(builder, /page_break_before=True/)

  for (const asset of ["mng-awb-face-form.png", "mng-awb-conditions.png"]) {
    const path = resolve(root, "assets", asset)
    assert.equal(existsSync(path), true)
    assert.ok(statSync(path).size > 100_000, `${asset} should contain printable artwork`)
  }
})

test("MNG Air Waybill remains a separate carrier template", () => {
  assert.equal(sample.meta.templateCode, "MNG_AWB")
  assert.equal(sample.routing[0].masterTransportReference, "716-44980843")
  assert.match(builder, /MNG AIRLINES/)
  assert.match(builder, /ORIGINAL 2/)
  assert.match(builder, /barcode\(code128,includetext:false,width:105,height:28\)/)
})

test("MNG Air Waybill is registered as a normal published template", () => {
  assert.match(registration, /'MNG_AWB'/)
  assert.match(registration, /'MNG Air Waybill'/)
  assert.match(registration, /'published'/)
  assert.doesNotMatch(registration, /carrier-review|requiresCarrierApproval/)
  assert.match(registration, /'pageCount', 2/)
  assert.match(registration, /'bucket', 'multideck-template-sources'/)
})
