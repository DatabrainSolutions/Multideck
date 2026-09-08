import assert from "node:assert/strict"
import test from "node:test"
import jsQR from "jsqr"
import sharp from "sharp"
import { DEFAULT_QR_STYLE, encodeQr, qrSvgDocument } from "../src/lib/qr-code.ts"

// Decode the exported artwork, not just the encoder's own matrix. This catches
// rendering regressions which structural assertions cannot detect.
for (const level of ["M", "Q", "H"] as const) {
  let length = 1
  for (let version = 1; version <= 10; version++) {
    while (encodeQr("x".repeat(length), level)?.version !== version && length < 220) length++
    const payload = "x".repeat(length)
    test(`export decodes at ${level}, version ${version}, all appearances`, async () => {
      const matrix = encodeQr(payload, level)!
      assert.ok(matrix)
      assert.equal(matrix.version, version)
      for (const moduleStyle of ["square", "rounded", "dots"] as const) {
        for (const eyeStyle of ["square", "rounded", "circle"] as const) {
          for (const logoArea of level === "H" ? [0, 0.16, 0.24, 0.3] : [0]) {
            const svg = qrSvgDocument(matrix, { ...DEFAULT_QR_STYLE, moduleStyle, eyeStyle, logoArea })
            for (const size of [192, 384]) {
              const { data, info } = await sharp(Buffer.from(svg)).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
              const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height)
              assert.equal(decoded?.data, payload, `v${matrix.version} ${moduleStyle}/${eyeStyle}, logo ${logoArea}, ${size}px`)
            }
          }
        }
      }
    })
  }
}

test("actual local and tenant QR destinations survive artwork export", async () => {
  for (const payload of ["http://localhost:3000/card/test?source=qr", "https://dev.multideck.app/card/harry-phillips?source=qr", "https://freight.example.com/card/operations-contact-card?source=qr"]) {
    const matrix = encodeQr(payload, "H")!
    const logo = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#004f4f"/></svg>').toString('base64')}`
    const svg = qrSvgDocument(matrix, { ...DEFAULT_QR_STYLE, moduleStyle: "dots", logoArea: 0.3 }, logo)
    const { data, info } = await sharp(Buffer.from(svg)).resize(384, 384).blur(0.3).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, payload)
  }
})
