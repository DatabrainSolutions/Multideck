import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../migrations/20260818101604_crm_lead_deal_write_boundaries.sql", import.meta.url),
  "utf8",
)

test("lead reads fail closed to the signed-in company", () => {
  assert.match(migration, /_multideck_crm_lead_is_reachable/)
  assert.match(migration, /organisation\."Org_id" is not null/)
  assert.match(migration, /owner\."Company_ID" = p_company_id/)
  assert.match(migration, /creator\."Company_ID" = p_company_id/)
  assert.match(migration, /Lead not found\.' using errcode = 'P0002'/)
  assert.match(migration, /revoke all on function public\.multideck_crm_list_leads\(text\) from public, anon, authenticated/)
  assert.match(migration, /revoke all on function public\.multideck_crm_get_lead\(uuid\) from public, anon, authenticated/)
})

test("CRM role permissions follow the customer read and write split", () => {
  assert.match(migration, /permission\."sys_Permission_Value" = 'CRM\.Read'/)
  assert.match(migration, /'administrator',[\s\S]*'operations manager',[\s\S]*'operator',[\s\S]*'viewer'/)
  assert.match(migration, /permission\."sys_Permission_Value" = 'CRM\.Write'/)
  assert.match(migration, /_multideck_crm_has_permission\(v_context\.user_id, 'CRM\.Read'\)/)
  assert.match(migration, /_multideck_crm_has_permission\(v_context\.user_id, 'CRM\.Write'\)/)
  assert.match(migration, /using errcode = '42501'/)
})

test("deal edits use canonical columns and reject foreign related records", () => {
  assert.match(migration, /"CRMOppty_OriginNameSnapshot"/)
  assert.match(migration, /"CRMOppty_DestinationNameSnapshot"/)
  assert.doesNotMatch(migration, /"CRMOppty_OriginName"\s*=/)
  assert.doesNotMatch(migration, /"CRMOppty_DestinationName"\s*=/)
  assert.match(migration, /contact\."Org_id" = v_deal\."CRMOppty_OrgID"/)
  assert.match(migration, /owner\."Company_ID" = v_context\.company_id/)
  assert.match(migration, /coalesce\(owner\."User_AccessStatus", 'active'\) = 'active'/)
})

test("lead and deal changes lock rows and expose only authenticated RPCs", () => {
  assert.match(migration, /for update of deal/)
  assert.match(migration, /from public\."CRM_Leads"[\s\S]*for update/)
  assert.match(migration, /Deal changes must be an object/)
  assert.match(migration, /Lead changes must be an object/)
  assert.match(migration, /grant execute on function public\.multideck_crm_update_deal\(uuid, jsonb\) to authenticated/)
  assert.match(migration, /grant execute on function public\.multideck_crm_update_lead\(uuid, jsonb\) to authenticated/)
})
