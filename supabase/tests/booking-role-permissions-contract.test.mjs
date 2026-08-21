import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const migration = await readFile(
  new URL("supabase/migrations/20260820225732_grant_booking_permissions_to_operational_roles.sql", root),
  "utf8",
)

test("operational roles receive the same booking access shape as quotes", () => {
  for (const role of ["Administrator", "Operations manager", "Operator"]) {
    assert.match(migration, new RegExp(`\\('${role}', 'Bookings\\.Read'\\)`))
    assert.match(migration, new RegExp(`\\('${role}', 'Bookings\\.Write'\\)`))
  }

  assert.match(migration, /\('Viewer', 'Bookings\.Read'\)/)
  assert.doesNotMatch(migration, /\('Viewer', 'Bookings\.Write'\)/)
  assert.match(migration, /on conflict \("sys_UserRole_ID", "sys_Permission_ID"\) do nothing/)
})
