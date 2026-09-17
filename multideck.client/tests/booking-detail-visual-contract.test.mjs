import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/components/multideck/booking-components.tsx", import.meta.url), "utf8")

test("booking overview distinguishes unavailable forecasts from planned dates", () => {
  assert.match(source, /function BookingDexterForecastStatus/u)
  assert.match(source, /Forecast unavailable/u)
  assert.match(source, /Planned dates are not an on-time probability/u)
  assert.doesNotMatch(source, /statusBase|confidenceSeries/u)
})

test("booking tabs reuse the quote tab rail with reduced-motion-safe selection", async () => {
  const header = source.slice(source.indexOf("function BookingDetailHeader"), source.indexOf("function BookingJobContext"))
  const tabs = await readFile(new URL("../src/components/ui/tabs.tsx", import.meta.url), "utf8")
  assert.match(header, /<Tabs value=\{activeTab\}/u)
  assert.match(header, /<TabsList variant="line"/u)
  assert.match(header, /<TabsTrigger key=\{tab.id\} value=\{tab.id\}/u)
  assert.match(tabs, /useReducedMotion/u)
  assert.match(tabs, /reduceMotion\(Boolean\(shouldReduceMotion\)/u)
})

test("booking details retain the workspace tabs and use the selected full-width flow", () => {
  const details = source.slice(source.indexOf("function BookingRecordDetails"), source.indexOf("function BookingWorkspaceSectionTitle"))

  assert.match(source, /function BookingRouteSummary/u)
  assert.match(source, /data-booking-route-summary/u)
  assert.match(source, /id=\{bookingTabId\(tab\.id as BookingDetailTab\)\}/u)
  assert.match(source, /aria-controls=\{bookingTabPanelId\(tab\.id as BookingDetailTab\)\}/u)
  assert.match(source, /role="tabpanel"/u)
  assert.match(details, /title="Goods" contentClassName="sm:grid-cols-2 xl:grid-cols-4"/u)
  assert.match(details, /BookingCargoWiseField label="Goods description" value=\{goodsDescription\}/u)
  assert.match(details, /BookingCargoWiseField label="Other handling" value=\{bookingCargoOtherHandling\(knownCargo\)\}/u)
  assert.match(details, /<CargoHandlingEditor[\s\S]*?value=\{cargo.handlingDetailsJson/u)
  assert.match(details, /editCargo\(cargoIndex, "knownCargo"\)/u)
  assert.match(details, /editCargo\(cargoIndex, "description"\)/u)
  assert.match(details, /workspace\.cargo\[cargoIndex\]/u)
  assert.match(details, /workspace\.cargo\.map\(\(line, index\)/u)
  assert.match(details, /data-booking-continuous-details/u)
  assert.doesNotMatch(details, /<Tabs|detailSection|setDetailSection/u)
  for (const section of ["control", "parties", "route", "cargo"]) assert.ok(details.includes(`data-booking-detail-section="${section}"`))
  assert.doesNotMatch(details, /editCargo\(0,/u)
  assert.match(details, /<BookingContainerDetails/u)
  assert.doesNotMatch(details, /<BookingAvailabilityInspector/u)
})

test("booking detail controls keep equal widths across responsive columns", () => {
  assert.match(source, /span && "md:col-span-2 xl:col-span-1 2xl:col-span-2"/u)
  assert.match(source, /SelectTrigger id=\{fieldId\} aria-label=\{t\(label\)\} className="h-8 w-full min-w-0/u)
})

test("container rows expose the quote goods allocation fields", () => {
  const containers = source.slice(source.indexOf("function bookingContainerDataValue"), source.indexOf("function BookingRecordDetails"))

  assert.match(containers, /"Package type"/u)
  assert.match(containers, /bookingContainerDataValue\(container, "packageType"\)/u)
  assert.match(containers, /bookingContainerDataValue\(container, "packages"\)/u)
  assert.match(containers, /container\.grossWeightKg/u)
  assert.match(containers, /bookingContainerDataValue\(container, "volumeCbm"\)/u)
})

test("booking equipment summaries retain the quantity of each container type", () => {
  assert.match(source, /containerCounts\.entries\(\)\]\.map\(\(\[type, quantity\]\) => `\$\{quantity\} × \$\{type\}`\)\.join\("; "\)/u)
})
