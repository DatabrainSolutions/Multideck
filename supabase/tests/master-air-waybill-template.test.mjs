import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { test } from "node:test"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..", "templates", "master-air-waybill")
const source = readFileSync(resolve(root, "master-air-waybill-carbone-template.html"), "utf8")
const docxBuilder = readFileSync(resolve(root, "build-docx.py"), "utf8")
const registration = readFileSync(resolve(import.meta.dirname, "..", "migrations", "20260805160000_register_master_air_waybill_template_draft.sql"), "utf8")
const publication = readFileSync(resolve(import.meta.dirname, "..", "migrations", "20260805170000_publish_master_air_waybill_template.sql"), "utf8")
const replacementPublishing = readFileSync(resolve(import.meta.dirname, "..", "migrations", "20260806083120_keep_published_template_saves_current.sql"), "utf8")

test("MAWB source uses only the approved job snapshot paths", () => {
  const tags = [...source.matchAll(/\{(d\.[^}]+)\}/g)].map((match) => match[1])
  const permitted = [
    /^d\.shipper(?:\.|$)/,
    /^d\.consignee(?:\.|$)/,
    /^d\.job(?:\.|$)/,
    /^d\.routing\[isMainCarriage=true\](?:\.|$)/,
    /^d\.cargo(?:\[|\.|$)/,
  ]

  assert.ok(tags.length > 0)
  for (const tag of tags) assert.ok(permitted.some((path) => path.test(tag)), `Unexpected MAWB data path: ${tag}`)
  assert.equal(source.includes("{{"), false)
})

test("MAWB source uses bounded cargo summaries and aggregate totals", () => {
  assert.match(source, /\{d\.cargo\[\]\.packageQuantity:aggSum\}/)
  assert.match(source, /\{d\.cargo\[\]\.grossWeight:aggSum:formatN\(2\)\}/)
  assert.match(source, /\{d\.cargo\[\]\.volume:aggSum:formatN\(3\)\}/)
  assert.match(docxBuilder, /\{d\.cargo\[\]\.hsCode:aggStr\(' · '\):ellipsis\(12\)\}/)
  assert.match(docxBuilder, /\{d\.cargo\[\]\.commodity:aggStr\(' · '\):ellipsis\(30\)\}/)
  assert.doesNotMatch(docxBuilder, /d\.cargo\[i(?:\+1)?\]/)
})

test("MAWB values stay inside the supplied IATA form boxes", () => {
  assert.match(docxBuilder, /masterTransportReference:substr\(0,3\)/)
  assert.match(docxBuilder, /origin\.unlocode:substr\(2,5\)/)
  assert.match(docxBuilder, /weightUnit:substr\(0,1\)/)
  assert.match(docxBuilder, /\("cargo-pieces", 44, 391, 28, 126/)
  assert.match(docxBuilder, /\("cargo-weight", 74, 391, 48, 126/)
  assert.match(docxBuilder, /\("cargo-unit", 123, 391, 12, 126/)
  assert.match(docxBuilder, /\("cargo-chargeable", 214, 391, 48, 126/)
  assert.match(docxBuilder, /font="Arial"/)
  assert.doesNotMatch(docxBuilder, /"route-to-two"/)
  assert.doesNotMatch(docxBuilder, /"Courier New"/)
})

test("MAWB build expands every supplied air waybill copy", () => {
  for (const label of [
    "ORIGINAL 1 (FOR ISSUING CARRIER)",
    "ORIGINAL 2 (FOR CONSIGNEE)",
    "ORIGINAL 3 (FOR SHIPPER)",
    "COPY 4 (DELIVERY RECEIPT)",
    "COPY 5 (FOR AIRPORT OF DESTINATION)",
    "COPY 6 (FOR THIRD CARRIER)",
  ]) assert.match(docxBuilder, new RegExp(label.replace(/[()]/g, "\\$&")))
  assert.match(source, /\[\[MAWB_COPY_LABEL\]\]/)
  assert.match(docxBuilder, /for index, label in enumerate\(COPY_LABELS\)/)
  assert.match(docxBuilder, /add_face\(document, assets, label, index\)/)
  assert.match(docxBuilder, /add_terms\(document, assets, index\)/)
})

test("MAWB build embeds the supplied face and complete conditions artwork", () => {
  for (const asset of ["mawb-face-form.png", "mawb-conditions.png"]) {
    const path = resolve(root, "assets", asset)
    assert.equal(existsSync(path), true)
    assert.ok(statSync(path).size > 100_000, `${asset} should contain printable artwork`)
    assert.match(docxBuilder, new RegExp(asset.replace(".", "\\.")))
  }
  assert.match(docxBuilder, /barcode\(code128,includetext:false,width:105,height:28\)/)
})

test("MAWB registration is published without a separate approval stage", () => {
  assert.match(registration, /'MAWB'/)
  assert.match(registration, /'draft'/)
  assert.match(registration, /'provider', 'supabase_storage'/)
  assert.match(registration, /'bucket', 'multideck-template-sources'/)
  assert.match(publication, /"DOCBTV_StatusCode" = 'published'/)
  assert.match(publication, /requiresCarrierApproval/)
  assert.match(publication, /'false'::jsonb/)
  assert.match(replacementPublishing, /when selected_template\."DOCBT_StatusCode" = 'published' then 'published'/)
  assert.match(replacementPublishing, /"DOCBT_CurrentVersionNo" = case/)
})
