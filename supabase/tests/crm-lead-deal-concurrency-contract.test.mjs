import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260818123000_crm_lead_deal_optimistic_concurrency.sql", import.meta.url), "utf8")
const dealContactFix = readFileSync(new URL("../migrations/20260818125500_crm_deal_contact_column_fix.sql", import.meta.url), "utf8")
const leadApi = readFileSync(new URL("../../multideck.client/src/lib/lead-api.ts", import.meta.url), "utf8")
const dealApi = readFileSync(new URL("../../multideck.client/src/lib/deal-api.ts", import.meta.url), "utf8")
const crmRpc = readFileSync(new URL("../../multideck.client/src/lib/crm-supabase.ts", import.meta.url), "utf8")
const leadPage = readFileSync(new URL("../../multideck.client/src/pages/crm-page.tsx", import.meta.url), "utf8")
const dealPage = readFileSync(new URL("../../multideck.client/src/pages/crm-deal-detail-page.tsx", import.meta.url), "utf8")

test("lead and deal versions advance for every persisted record mutation", () => {
  assert.match(migration, /CRMLead_EditVersion" bigint not null default 1/)
  assert.match(migration, /CRMOppty_EditVersion" bigint not null default 1/)
  assert.match(migration, /TR_CRM_Leads_edit_version/)
  assert.match(migration, /TR_CRM_Opportunities_edit_version/)
  assert.match(migration, /old\."CRMLead_EditVersion" \+ 1/)
  assert.match(migration, /old\."CRMOppty_EditVersion" \+ 1/)
})

test("organisation-backed leads use the explicit account company boundary", () => {
  assert.match(migration, /multideck_crm_company_can_access_account\(p_company_id, lead\."CRMLead_OrgID"\)/)
  assert.match(migration, /owner\."Company_ID" = p_company_id[\s\S]*User_AccessStatus/)
  assert.match(migration, /creator\."Company_ID" = p_company_id[\s\S]*User_AccessStatus/)
})

test("only expected-version lead and deal write RPCs remain callable", () => {
  assert.match(migration, /multideck_crm_update_lead\(\s*p_lead_id uuid,\s*p_expected_version bigint/s)
  assert.match(migration, /multideck_crm_update_deal\(\s*p_deal_id uuid,\s*p_expected_version bigint/s)
  assert.match(migration, /v_current_version <> p_expected_version/)
  assert.match(migration, /CRM_CONFLICT: This lead changed elsewhere/)
  assert.match(migration, /CRM_CONFLICT: This deal changed elsewhere/)
  assert.match(migration, /rename to _multideck_crm_update_lead_unversioned_20260818/)
  assert.match(migration, /rename to _multideck_crm_update_deal_unversioned_20260818/)
  assert.match(migration, /revoke all on function public\._multideck_crm_update_lead_unversioned_20260818\(uuid, jsonb\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.multideck_crm_update_deal\(uuid, bigint, jsonb\) to authenticated/)
})

test("read contracts return versions without disturbing list order", () => {
  assert.match(migration, /jsonb_build_object\('editVersion', lead\."CRMLead_EditVersion"\)/)
  assert.match(migration, /jsonb_build_object\('editVersion', deal\."CRMOppty_EditVersion"\)/)
  assert.match(migration, /order by entry\.ordinal/g)
  assert.match(leadApi, /editVersion: number/)
  assert.match(dealApi, /editVersion: number/)
})

test("clients send expected versions, serialize saves and refresh conflicts", () => {
  assert.match(leadApi, /p_expected_version: expectedVersion/)
  assert.match(dealApi, /p_expected_version: expectedVersion/)
  assert.match(crmRpc, /class CrmConflictError/)
  assert.match(crmRpc, /error\.code === "P0001" && error\.message\?\.startsWith\("CRM_CONFLICT:"\)/)
  assert.match(leadPage, /leadSaveQueue\.current\.then/)
  assert.match(leadPage, /cause instanceof CrmConflictError[\s\S]*getLead\(leadId\)/)
  assert.match(dealPage, /dealSaveQueue\.current\.then/)
  assert.match(dealPage, /cause instanceof CrmConflictError[\s\S]*getDeal\(dealId, \{ forceRefresh: true \}\)/)
})

test("deal contact validation uses the canonical quoted organisation column", () => {
  assert.match(dealContactFix, /create or replace function public\._multideck_crm_update_deal_unversioned_20260818/)
  assert.match(dealContactFix, /contact\."Org_ID" = v_deal\."CRMOppty_OrgID"/)
  assert.doesNotMatch(dealContactFix, /contact\."Org_id"/)
  assert.match(dealContactFix, /revoke all on function public\._multideck_crm_update_deal_unversioned_20260818\(uuid, jsonb\)/)
})
