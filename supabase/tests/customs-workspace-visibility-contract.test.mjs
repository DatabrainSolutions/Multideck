import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const migration = readFileSync(resolve(root, "supabase/migrations/20260820174257_share_customs_declarations_with_workspace.sql"), "utf8")
const edgeAuthorisationMigration = readFileSync(resolve(root, "supabase/migrations/20260820175337_expose_customs_workspace_authorisation_helper.sql"), "utf8")
const iCustomsEdge = readFileSync(resolve(root, "supabase/functions/icustoms-api/index.ts"), "utf8")

test("Customs visibility is shared only inside the active physical-tenant company", () => {
  assert.match(migration, /caller\."Company_ID" is not null/u)
  assert.match(migration, /caller\."Company_ID" = declaration_creator\."Company_ID"/u)
  assert.match(migration, /coalesce\(caller\."User_AccessStatus", 'active'\) = 'active'/u)
  assert.match(migration, /case when require_write then 'Customs\.Write' else 'Customs\.Read' end/u)
  assert.doesNotMatch(migration, /using \(true\)/u)
})

test("the declaration, item and generated-document read policies use the same workspace boundary", () => {
  assert.match(migration, /Workspace users can read company Customs declarations/u)
  assert.match(migration, /Workspace users can read company Customs items/u)
  assert.match(migration, /Workspace users read company Customs declaration documents/u)
  assert.match(migration, /customs_declaration_current_user_authorised\("CUST_id", false\)/u)
  assert.match(migration, /customs_declaration_current_user_authorised\("CUSTI_CustomsID", false\)/u)
  assert.match(migration, /customs_declaration_current_user_authorised\("CUSTD_CustomsID", false\)/u)
})

test("existing declarations keep their creator as the initial visible assignee", () => {
  assert.match(migration, /set "CUST_AssignedUserID" = creator\."User_ID"/u)
  assert.match(migration, /before insert on public\."Customs_Declarations"/u)
  assert.match(migration, /'assignedUserId', assigned_user_id/u)
  assert.match(migration, /multideck_customs_assignees_by_ids/u)
  assert.match(migration, /'profilePhoto'/u)
})

test("the picker is bounded, company-scoped, permission-aware and audited", () => {
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 50\), 1\), 50\)/u)
  assert.match(migration, /workspace_user\."Company_ID" = v_actor\."Company_ID"/u)
  assert.match(migration, /booking_api\.has_permission\(v_target\."Auth_User_ID", 'Customs\.Write'\)/u)
  assert.match(migration, /'declaration_assigned'/u)
  assert.match(migration, /revoke all on function public\.assign_customs_declaration\(uuid, uuid\) from public, anon/u)
})

test("Dexter reads and deterministic watch signals include shared assignment evidence", () => {
  assert.match(migration, /'assignedUserName'/u)
  assert.match(migration, /'assignedUserEmail'/u)
  assert.match(migration, /"CUST_AssignedUserID", "CUST_Status"/u)
  assert.match(migration, /watch\."AIDexterWatch_CompanyID" = v_company_id/u)
  assert.match(migration, /Assignment changes must use the declaration profile picker/u)
})

test("the connected Customs Edge Function reuses workspace authorisation without exposing caller impersonation", () => {
  assert.match(iCustomsEdge, /"customs_declaration_authorised"/u)
  assert.match(edgeAuthorisationMigration, /booking_api\.customs_access\(/u)
  assert.match(edgeAuthorisationMigration, /from public, anon, authenticated/u)
  assert.match(edgeAuthorisationMigration, /to service_role/u)
})
