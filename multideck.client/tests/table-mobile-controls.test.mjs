import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")
const table = read("components/multideck/data-table.tsx")
const bookings = read("pages/bookings-page.tsx")
const advanced = read("components/multideck/advanced-filter-popover.tsx")

test("mobile controls constrain the popover and override desktop search width", () => {
  assert.ok(table.includes('group/table-controls w-[min(360px,calc(100vw-24px))]'))
  assert.ok(table.includes('max-h-[var(--radix-popover-content-available-height)]'))
  assert.ok(table.includes('[&>*]:!max-w-none'))
  assert.ok(table.includes('[&_input]:min-h-11'))
  assert.ok(table.includes('[&_button]:min-h-11'))
  assert.ok(table.includes('if (isInsideFloatingLayer(event.target)) event.preventDefault()'))
})

test("booking filters adapt only inside mobile controls and retain meaningful action labels", () => {
  assert.ok(bookings.includes('group-data-[mobile=true]/table-controls:grid-cols-2'))
  assert.ok(bookings.includes('group-data-[mobile=true]/table-controls:min-w-0'))
  assert.ok(bookings.includes('t("Customer name")'))
  assert.ok(advanced.includes('hidden lg:inline group-data-[mobile=true]/table-controls:inline'))
  assert.ok(advanced.includes('aria-label={t(label)}'))
})
