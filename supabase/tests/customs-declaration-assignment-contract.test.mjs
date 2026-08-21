import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const migration = read("supabase/migrations/20260820160000_customs_declaration_assignment.sql")
const api = read("multideck.client/src/lib/customs-drafts-api.ts")
const page = read("multideck.client/src/pages/customs-declarations-page.tsx")

test("Customs assignment is company-scoped, permission-aware and audited", () => {
  assert.match(migration, /add column if not exists "CUST_AssignedUserID"/u)
  assert.match(migration, /workspace_user\."Company_ID" = v_actor\."Company_ID"/u)
  assert.match(migration, /booking_api\.has_permission\(v_target\."Auth_User_ID", 'Customs\.Write'\)/u)
  assert.match(migration, /booking_api\.customs_access\(auth\.uid\(\), p_declaration_id, true\)/u)
  assert.match(migration, /'declaration_assigned'/u)
  assert.match(migration, /grant execute on function public\.assign_customs_declaration[\s\S]*to authenticated, service_role/u)
})

test("the bounded selector shows active workspace users and profile-photo metadata", () => {
  assert.match(migration, /multideck_customs_assignment_users_page/u)
  assert.match(migration, /least\(greatest\(coalesce\(p_limit, 50\), 1\), 50\)/u)
  assert.match(migration, /coalesce\(workspace_user\."User_AccessStatus", 'active'\) = 'active'/u)
  assert.match(migration, /'profilePhoto'/u)
  assert.match(migration, /'canWorkCustoms'/u)
  assert.match(api, /listCustomsDeclarationAssignees/u)
  assert.match(api, /multideck_customs_assignees_by_ids/u)
})

test("all four Customs registers keep an assignee avatar and declarations expose the top-right picker", () => {
  assert.match(page, /id: "assignedTo"[\s\S]*<DeclarationAssigneeAvatar/u)
  assert.match(page, /<AvatarImage src=\{resolvedPhotoUrl\} alt=""/u)
  assert.match(page, /legacyCurrentUser = !draft\.assignmentSupported/u)
  assert.match(page, /<DeclarationAssigneePicker declarationId=\{declarationId\} t=\{t\} \/>/u)
  assert.match(page, /listCustomsDeclarationAssignees\(debouncedSearch, 50, offset/u)
  assert.match(page, /assignCustomsDeclaration\(declarationId, nextAssignee\?\.id \?\? null\)/u)
  assert.match(page, /jobRelated \? "job-related" : "standalone"/u)
  assert.match(page, /kind === "export" \? "Export" : "Import"/u)
})

test("assignment is visible to Dexter reads and deterministic watch signals", () => {
  assert.match(migration, /'assignedUserId', declaration\."CUST_AssignedUserID"/u)
  assert.match(migration, /'assignedUserName'/u)
  assert.match(migration, /'assignedUserEmail'/u)
  assert.match(migration, /"CUST_AssignedUserID","CUST_Status"/u)
  assert.match(migration, /"AIDexterWatchCapability_FieldsJSON"[\s\S]*assignedUserId/u)
})
