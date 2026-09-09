import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../src/pages/bookings-page.tsx", import.meta.url), "utf8")

test("booking rows show one status treatment without duplicate exception text", () => {
  const statusColumn = source.slice(source.indexOf('id: "status"'), source.indexOf('id: "booking"'))

  assert.match(statusColumn, /label: t\("Status"\)/u)
  assert.match(statusColumn, /cell: \(booking\) => <BookingStatusPill status=\{booking\.status\} \/>/u)
  assert.doesNotMatch(statusColumn, /getBookingExceptionSummary\(booking\).*<p/u)
})

test("transport mode and movement use dedicated compact columns", () => {
  const columnsStart = source.indexOf("const columns = useMemo<DataTableColumn<LiveBooking>[]>(() => [")
  const modeColumnStart = source.indexOf('id: "mode"', columnsStart)
  const movementColumnStart = source.indexOf('id: "movement"', columnsStart)
  const originColumnStart = source.indexOf('id: "origin"', columnsStart)
  const modeColumn = source.slice(modeColumnStart, movementColumnStart)
  const movementColumn = source.slice(movementColumnStart, originColumnStart)

  assert.ok(modeColumnStart > 0 && movementColumnStart > modeColumnStart)
  assert.match(modeColumn, /label: t\("Mode"\)/u)
  assert.match(modeColumn, /<BookingModePill mode=\{booking\.mode\} \/>/u)
  assert.doesNotMatch(movementColumn, /BookingModePill/u)
  assert.match(movementColumn, /kind: "attribute"/u)
  assert.match(movementColumn, /<StatusPill tone=\{bookingDirectionTone\(direction\)\}>\{t\(direction\)\}<\/StatusPill>/u)
  assert.match(source, /direction === "Cross trade"\) return "purple"/u)
  assert.doesNotMatch(source.slice(source.indexOf("function bookingDirectionTone"), source.indexOf("function formatOperationalDate")), /return "red"/u)
  assert.match(source, /const bookingTableStorageKey = "booking-register-operations-v4"/u)
  assert.match(source, /storageKey=\{bookingTableStorageKey\}/u)
})

test("the register keeps customer concise and separates origin from destination", () => {
  const columnsStart = source.indexOf("const columns = useMemo<DataTableColumn<LiveBooking>[]>(() => [")
  const customerColumnStart = source.indexOf('id: "customerCargo"', columnsStart)
  const modeColumnStart = source.indexOf('id: "mode"', columnsStart)
  const customerColumn = source.slice(customerColumnStart, modeColumnStart)
  const originColumnStart = source.indexOf('id: "origin"', columnsStart)
  const destinationColumnStart = source.indexOf('id: "destination"', columnsStart)
  const scheduleColumnStart = source.indexOf('id: "schedule"', columnsStart)

  assert.match(customerColumn, /label: t\("Customer"\)/u)
  assert.doesNotMatch(customerColumn, /shipmentType|container|General cargo|Equipment pending/u)
  assert.ok(originColumnStart > 0 && destinationColumnStart > originColumnStart && scheduleColumnStart > destinationColumnStart)
  assert.match(source.slice(originColumnStart, destinationColumnStart), /booking\.origin/u)
  assert.match(source.slice(destinationColumnStart, scheduleColumnStart), /booking\.destination/u)
})

test("booking ownership is an All and Mine switch in the register toolbar", () => {
  assert.match(source, /const bookingOwnershipScopes = \["All", "Mine"\] as const/u)
  assert.match(source, /toolbarTabs=\{<RegisterViewSwitch options=\{bookingOwnershipScopes\}/u)
  assert.match(source, /scope: registerScope/u)
  assert.match(source, /operatorCode: currentOperatorCode/u)
  assert.match(source, /No bookings assigned to you/u)
  assert.match(source, /setScope\("All"\)/u)
  assert.doesNotMatch(source, /bookingScopeTabs/u)
})
