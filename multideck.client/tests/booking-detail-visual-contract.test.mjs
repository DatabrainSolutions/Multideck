import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/components/multideck/booking-components.tsx", import.meta.url), "utf8")

test("booking overview presents a Dexter arrival-confidence area chart", () => {
  assert.match(source, /function BookingDexterArrivalConfidence/u)
  assert.match(source, /On-time probability by journey time/u)
  assert.match(source, /<linearGradient id=\{gradientId\}/u)
  assert.match(source, /var\(--md-status-green-ink\)/u)
  assert.match(source, /stopOpacity="0"/u)
  assert.match(source, /<motion\.path d=\{area\}/u)
  assert.match(source, /Forecast across the scheduled departure-to-arrival window/u)
})

test("booking tabs use a reduced-motion-safe sliding selection surface", () => {
  assert.match(source, /layoutId=\{`\$\{bookingTabControlId\}-active-segment`\}/u)
  assert.match(source, /transition=\{reduceMotion\(Boolean\(shouldReduceMotion\), mdMotion\.spring\)\}/u)
  assert.match(source, /<span className="relative z-10">\{tab\.label\}<\/span>/u)
})
