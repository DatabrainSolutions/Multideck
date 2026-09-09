import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [linkMigration, reviewMigration] = await Promise.all([
  readFile(new URL("../migrations/20260904154000_booking_quote_sync_notification_link.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/20260904100000_quote_booking_sync_reviews.sql", import.meta.url), "utf8"),
])

test("the accepted quote booking-review notification uses a registered link type", () => {
  assert.match(reviewMigration, /'booking_quote_sync'/u)
  assert.match(linkMigration, /insert into public\."sys_CommLinkTypes"/u)
  assert.match(linkMigration, /'booking_quote_sync'/u)
  assert.match(linkMigration, /on conflict \("CommLinkType_Code"\) do update/u)
  assert.match(linkMigration, /"CommLinkType_IsActive" = true/u)
})
