import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(new URL("../migrations/20260813194429_delete_customs_draft.sql", import.meta.url), "utf8")
const dexter = await readFile(new URL("../functions/agent-dexter/index.ts", import.meta.url), "utf8")

test("Customs draft deletion stays owner-bound, draft-only, and soft", () => {
  assert.match(migration, /security definer/u)
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/u)
  assert.match(migration, /"CUST_CreatedBy" = v_user_id/u)
  assert.match(migration, /v_status <> 'draft'/u)
  assert.match(migration, /"CUST_IsDeleted" = true/u)
  assert.doesNotMatch(migration, /delete from public\."Customs_Declarations"/u)
})

test("Customs draft deletion is audited and unavailable to anonymous callers", () => {
  assert.match(migration, /insert into public\."Customs_AuditLog"/u)
  assert.match(migration, /'draft_deleted'/u)
  assert.match(migration, /revoke all on function public\.delete_customs_draft\(uuid\) from public, anon/u)
  assert.match(migration, /grant execute on function public\.delete_customs_draft\(uuid\) to authenticated/u)
})

test("Dexter names the destructive-action exception instead of guessing support", () => {
  assert.match(migration, /Dexter parity exception/u)
  assert.match(dexter, /Deleting a Customs draft is intentionally not available to Dexter/u)
  assert.match(dexter, /not a meaningful Watching for you event/u)
})
