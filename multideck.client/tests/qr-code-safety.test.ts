import assert from "node:assert/strict"
import test from "node:test"
import { qrContrastRatio } from "../src/lib/color.ts"
import { DEFAULT_QR_STYLE, encodeQr, qrLogoBounds, qrSvgDocument } from "../src/lib/qr-code.ts"

test("invalid, inverted and low-contrast QR colours cannot pass the safety gate", () => {
  assert.equal(qrContrastRatio("#000", "#fff"), 21)
  assert.equal(qrContrastRatio("#fff", "#000"), 0)
  assert.equal(qrContrastRatio("transparent", "#fff"), 0)
  assert.equal(qrContrastRatio("#000", '" onload="alert(1)'), 0)
  assert.ok(qrContrastRatio("#eee", "#fff") < 3)
})

test("logo coverage is bounded at high correction and SVG attributes stay escaped", () => {
  assert.equal(qrLogoBounds(encodeQr("example", "M")!, 0.24), null)
  const matrix = encodeQr("example", "H")!
  const logo = qrLogoBounds(matrix, 1)!
  assert.ok(logo.span / matrix.size <= 0.24)
  assert.equal(qrLogoBounds(matrix, NaN), null)
  const svg = qrSvgDocument(matrix, { ...DEFAULT_QR_STYLE, logoArea: 0.24 }, 'https://example.com/logo?a=1&b="quoted"')
  assert.ok(svg.includes('&amp;b=&quot;quoted&quot;'))
  assert.ok(!svg.includes('b="quoted"'))
})
