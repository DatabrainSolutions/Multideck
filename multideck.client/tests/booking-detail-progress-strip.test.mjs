import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/components/multideck/booking-components.tsx", import.meta.url), "utf8")

test("booking overview uses the quote-style five-section progress strip", () => {
  const overview = source.slice(source.indexOf("function BookingOverviewSignals"), source.indexOf("function BookingBlockerSection"))

  for (const label of ["Booked", "Origin", "Departed", "Destination", "Released"]) {
    assert.match(overview, new RegExp(`label: "${label}"`, "u"))
  }

  assert.match(overview, /md-quote-stage-panel__steps/u)
  assert.match(overview, /--md-quote-stage-progress/u)
  assert.match(overview, /md-quote-stage-metadata/u)
  assert.match(overview, /grid-rows-\[auto_auto_auto\]/u)
  assert.match(overview, /\{tabs\}/u)
  assert.doesNotMatch(overview, /BookingOverviewFact/u)
})

test("booking tabs, progress and metadata form the left stack beside a full-height forecast", () => {
  const header = source.slice(source.indexOf("function BookingDetailHeader"), source.indexOf("function BookingJobContext"))
  const forecast = source.slice(source.indexOf("function BookingDexterArrivalConfidence"), source.indexOf("function BookingOverviewSignals"))

  assert.match(header, /<BookingOverviewSignals record=\{record\} tabs=\{bookingTabs\} \/>/u)
  assert.match(header, /w-max min-w-full/u)
  assert.match(header, /min-w-\[72px\] flex-1/u)
  assert.match(forecast, /relative h-full min-h-0 overflow-hidden/u)
})

test("Dexter forecast retains its adaptive shader beneath a minimal curved green area graph", () => {
  const forecast = source.slice(source.indexOf("function chartPointPath"), source.indexOf("function BookingOverviewSignals"))

  assert.match(forecast, /SpectralBloomShader tone="brand" shape="composer"/u)
  assert.match(forecast, /var\(--md-accent-lift-warm\)/u)
  assert.match(forecast, /var\(--md-status-green-ink\)/u)
  assert.match(forecast, /return `\$\{path\} C/u)
  assert.match(forecast, /On-time probability by journey time/u)
  assert.match(forecast, /Confidence \(%\)/u)
  assert.match(forecast, /Scheduled journey/u)
  assert.match(forecast, /departureTime \+ \(\(arrivalTime - departureTime\)/u)
})
