import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../migrations/20260904152000_booking_quote_charge_apply_operational_permission.sql", import.meta.url), "utf8")
const applyMigration = await readFile(new URL("../migrations/20260904104500_quote_booking_sync_apply_preservation.sql", import.meta.url), "utf8")

test("accepted quote charges use the operational booking boundary", () => {
  assert.match(migration, /Accepted quote charges are operational job costing lines/)
  assert.match(migration, /booking_workflow_apply_quote_sync_before_payer_20260904/)
  assert.match(migration, /replace\(function_definition, finance_gate, ''\)/)
  assert.match(migration, /through Bookings\.Write/)
})

test("the underlying apply workflow keeps tenant, write and audit controls", () => {
  assert.match(applyMigration, /booking_api\.has_permission\(caller_auth_user_id,'Bookings\.Write'\)/)
  assert.match(applyMigration, /review\.company_id=app_user\."Company_ID"/)
  assert.match(applyMigration, /"JobCostingLine_CreatedBy","JobCostingLine_UpdatedBy"/)
  assert.match(applyMigration, /app_user\."User_ID",app_user\."User_ID"/)
  assert.match(applyMigration, /insert into booking_api\.events/)
})

test("finance-period preparation is not broadened to operational roles", () => {
  assert.doesNotMatch(migration, /sys_UserRole_Permissions/)
  assert.doesNotMatch(migration, /Finance manager/)
  assert.match(migration, /Finance\.Management\.Prepare remains reserved/)
})
