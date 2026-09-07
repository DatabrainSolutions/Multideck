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
  const forecast = source.slice(source.indexOf("function BookingDexterForecastStatus"), source.indexOf("function BookingOverviewSignals"))

  assert.match(header, /<BookingOverviewSignals record=\{record\} tabs=\{bookingTabs\} \/>/u)
  assert.match(header, /w-max min-w-full/u)
  assert.match(header, /min-w-\[72px\] flex-1/u)
  assert.match(forecast, /relative h-full min-h-0 overflow-hidden/u)
})

test("Dexter does not invent probability or historical chart points from booking status", () => {
  const forecast = source.slice(source.indexOf("function BookingDexterForecastStatus"), source.indexOf("function BookingOverviewSignals"))
  assert.match(forecast, /Forecast unavailable/u)
  assert.doesNotMatch(forecast, /statusBase|confidenceSeries|arrivalConfidence|<svg|<motion/u)
  assert.doesNotMatch(source, /function chartPointPath/u)
})
