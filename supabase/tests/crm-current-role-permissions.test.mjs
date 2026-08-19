import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../migrations/20260818102314_crm_current_role_permission_parity.sql", import.meta.url),
  "utf8",
)

test("current company roles receive the same CRM access as their legacy equivalents", () => {
  for (const role of ["Company Manager", "Company User"]) {
    for (const permission of [
      "Customers.Read",
      "Customers.Write",
      "CRM.Read",
      "CRM.Write",
      "CRM.Drive.Read",
      "CRM.Drive.Write",
    ]) {
      assert.match(migration, new RegExp(`\\('${role}', '${permission.replace(".", "\\.")}'\\)`))
    }
  }
  assert.doesNotMatch(migration, /Customers\.Delete/)
  assert.match(migration, /on conflict \("sys_UserRole_ID", "sys_Permission_ID"\) do nothing/)
})
