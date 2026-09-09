import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "../migrations/20260820215400_fix_dexter_email_action_tool_schemas.sql",
  ),
  "utf8",
)

test("Dexter email actions keep valid zero-argument strict schemas", () => {
  assert.match(migration, /where "AIDexterAction_Code" in \('create_email_draft', 'send_email'\)/)
  assert.match(migration, /'properties', jsonb_build_object\(\)/)
  assert.match(migration, /'required', jsonb_build_array\(\)/)
  assert.match(migration, /'additionalProperties', false/)
})
