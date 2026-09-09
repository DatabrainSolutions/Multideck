import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(
  new URL("../migrations/20260904162000_quote_booking_container_request_order.sql", import.meta.url),
  "utf8",
)

test("booking and Dexter summaries retain the quote request order", () => {
  assert.match(migration, /\{data,requestIndex\}/u)
  assert.match(migration, /order by request_order, first_created, type_code/u)
  assert.match(migration, /order by grouped\.request_order, grouped\.first_created, grouped\.type_code/u)
})

test("manual legacy rows fall back to deterministic creation and type order", () => {
  assert.match(migration, /else 2147483647/u)
  assert.match(migration, /first_created/u)
})
