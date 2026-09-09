import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../migrations/20260904151000_operational_role_quote_booking_parity.sql", import.meta.url), "utf8")

test("current internal roles can read and change quotes and bookings", () => {
  for (const role of ["Company Admin", "Company Manager", "Company User", "System Admin"]) {
    for (const permission of ["Quotes.Read", "Quotes.Write", "Bookings.Read", "Bookings.Write"]) {
      assert.match(migration, new RegExp(`\\('${role}', '${permission}'\\)`))
    }
  }
})

test("guest and viewer roles are not granted operational write access", () => {
  assert.doesNotMatch(migration, /\('Guest User', '(?:Quotes|Bookings)\.Write'\)/)
  assert.doesNotMatch(migration, /\('Viewer', '(?:Quotes|Bookings)\.Write'\)/)
})
