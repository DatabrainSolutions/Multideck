import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const designSource = await readFile(
  new URL("../src/components/multideck/contact-card-design.tsx", import.meta.url),
  "utf8",
)
const dataSource = await readFile(
  new URL("../src/data/contact-card-data.ts", import.meta.url),
  "utf8",
)
const rendererSource = await readFile(
  new URL("../src/components/multideck/contact-card-components.tsx", import.meta.url),
  "utf8",
)
const qrSource = await readFile(
  new URL("../src/lib/qr-code.ts", import.meta.url),
  "utf8",
)

test("contact-card design removes the header selector and keeps QR controls progressive", () => {
  assert.doesNotMatch(designSource, /<ControlRow label=\{t\("Header"\)\}/)
  assert.match(designSource, /QR appearance/)
  assert.match(designSource, /Fine tune appearance/)
  assert.match(designSource, /aria-expanded=\{qrFineTuneOpen\}/)
  assert.match(designSource, /Reliability/)
  assert.match(designSource, /Quiet zone/)
})

test("QR customisation persists safe visual and reliability choices", () => {
  assert.match(dataSource, /qrErrorCorrection: EccLevel/)
  assert.match(dataSource, /qrLogoSize: QrLogoSize/)
  assert.match(dataSource, /qrQuietZone: QrQuietZone/)
  assert.match(rendererSource, /branding\.qrErrorCorrection/)
  assert.match(rendererSource, /branding\.qrLogoSize/)
  assert.match(rendererSource, /branding\.qrQuietZone/)
  assert.match(qrSource, /Math\.max\(QR_QUIET_ZONE, Math\.round\(style\.quietZone\)\)/)
})
